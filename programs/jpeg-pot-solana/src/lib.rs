use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use mpl_core::{accounts::BaseAssetV1, instructions::TransferV1CpiBuilder as CoreTransferBuilder};
use mpl_token_metadata::{
    accounts::Metadata, instructions::TransferV1CpiBuilder as MetadataTransferBuilder,
    types::TokenStandard,
};

declare_id!("EWKyg1oNdNTNYoXegBwRG2ZHm5GqePQUjgFk7JRYMqtL");

const CONFIG_SEED: &[u8] = b"config";
const VAULT_SEED: &[u8] = b"vault";
const POSITION_SEED: &[u8] = b"position";
const PACKAGE_SEED: &[u8] = b"package";
const RECEIPT_SEED: &[u8] = b"receipt";
const MAX_POSITIONS_PER_PACKAGE: usize = 32;

#[program]
pub mod jpeg_pot_solana {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        terms_hash: [u8; 32],
        terms_uri: String,
        withdrawal_cooldown: i64,
    ) -> Result<()> {
        require!(terms_hash != [0; 32], JpegPotError::InvalidTerms);
        require!(
            !terms_uri.is_empty() && terms_uri.len() <= 200,
            JpegPotError::InvalidTerms
        );
        require!(withdrawal_cooldown >= 0, JpegPotError::InvalidCooldown);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.terms_hash = terms_hash;
        config.terms_uri = terms_uri.clone();
        config.terms_version = 1;
        config.withdrawal_cooldown = withdrawal_cooldown;
        config.total_active_positions = 0;
        config.next_package_id = 1;
        config.total_license_receipts = 0;
        config.bump = ctx.bumps.config;
        config.vault_bump = ctx.bumps.vault_authority;

        emit!(TermsPublished {
            version: 1,
            terms_hash,
            terms_uri,
        });
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_license_package(
        ctx: Context<CreateLicensePackage>,
        package_id: u64,
        manifest_hash: [u8; 32],
        license_terms_hash: [u8; 32],
        native_price_lamports: u64,
        duration_seconds: i64,
        rights_source: RightsSource,
        metadata_uri: String,
        license_uri: String,
        position_assets: Vec<Pubkey>,
    ) -> Result<()> {
        validate_package_definition(
            manifest_hash,
            license_terms_hash,
            native_price_lamports,
            duration_seconds,
            rights_source,
            &metadata_uri,
            &license_uri,
            &position_assets,
        )?;
        require!(
            package_id == ctx.accounts.config.next_package_id,
            JpegPotError::InvalidPackage
        );
        validate_position_accounts(
            ctx.program_id,
            &position_assets,
            ctx.remaining_accounts,
            false,
        )?;

        let license_package = &mut ctx.accounts.license_package;
        license_package.id = package_id;
        license_package.manifest_hash = manifest_hash;
        license_package.license_terms_hash = license_terms_hash;
        license_package.native_price_lamports = native_price_lamports;
        license_package.duration_seconds = duration_seconds;
        license_package.rights_source = rights_source;
        license_package.active = true;
        license_package.metadata_uri = metadata_uri.clone();
        license_package.license_uri = license_uri.clone();
        license_package.position_assets = position_assets.clone();
        license_package.bump = ctx.bumps.license_package;

        ctx.accounts.config.next_package_id = ctx
            .accounts
            .config
            .next_package_id
            .checked_add(1)
            .ok_or(JpegPotError::ArithmeticOverflow)?;

        emit!(LicensePackageCreated {
            package: license_package.key(),
            package_id,
            manifest_hash,
            license_terms_hash,
            native_price_lamports,
            duration_seconds,
            rights_source,
            position_count: u8::try_from(position_assets.len())
                .map_err(|_| error!(JpegPotError::TooManyPositions))?,
        });
        Ok(())
    }

    pub fn set_license_package_active(
        ctx: Context<ManageLicensePackage>,
        active: bool,
    ) -> Result<()> {
        ctx.accounts.license_package.active = active;
        emit!(LicensePackageAvailabilitySet {
            package: ctx.accounts.license_package.key(),
            active,
        });
        Ok(())
    }

    pub fn purchase_license(ctx: Context<PurchaseLicense>, receipt_nonce: u64) -> Result<()> {
        let license_package = &ctx.accounts.license_package;
        require!(license_package.active, JpegPotError::InvalidPackage);
        require!(
            license_package.license_terms_hash != [0; 32],
            JpegPotError::InvalidTerms
        );
        require!(
            ctx.accounts.beneficiary.key() != Pubkey::default(),
            JpegPotError::InvalidRecipient
        );

        let now = Clock::get()?.unix_timestamp;
        let valid_until = compute_valid_until(now, license_package.duration_seconds)?;
        validate_position_accounts(
            ctx.program_id,
            &license_package.position_assets,
            ctx.remaining_accounts,
            true,
        )?;
        lock_package_positions(
            ctx.program_id,
            &license_package.position_assets,
            ctx.remaining_accounts,
            valid_until,
        )?;

        let amount = license_package.native_price_lamports;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.purchaser.to_account_info(),
                    to: ctx.accounts.config.to_account_info(),
                },
            ),
            amount,
        )?;

        let receipt = &mut ctx.accounts.license_receipt;
        receipt.package = license_package.key();
        receipt.purchaser = ctx.accounts.purchaser.key();
        receipt.beneficiary = ctx.accounts.beneficiary.key();
        receipt.issued_at = now;
        receipt.valid_until = valid_until;
        receipt.amount_lamports = amount;
        receipt.manifest_hash = license_package.manifest_hash;
        receipt.license_terms_hash = license_package.license_terms_hash;
        receipt.receipt_nonce = receipt_nonce;
        receipt.bump = ctx.bumps.license_receipt;
        ctx.accounts.config.total_license_receipts = ctx
            .accounts
            .config
            .total_license_receipts
            .checked_add(1)
            .ok_or(JpegPotError::ArithmeticOverflow)?;

        emit!(LicensePurchased {
            receipt: receipt.key(),
            package: license_package.key(),
            package_id: license_package.id,
            purchaser: receipt.purchaser,
            beneficiary: receipt.beneficiary,
            amount_lamports: amount,
            valid_until,
            manifest_hash: receipt.manifest_hash,
            license_terms_hash: receipt.license_terms_hash,
        });
        Ok(())
    }

    pub fn publish_terms(
        ctx: Context<ManageConfig>,
        terms_hash: [u8; 32],
        terms_uri: String,
    ) -> Result<()> {
        require!(terms_hash != [0; 32], JpegPotError::InvalidTerms);
        require!(
            !terms_uri.is_empty() && terms_uri.len() <= 200,
            JpegPotError::InvalidTerms
        );

        let config = &mut ctx.accounts.config;
        config.terms_hash = terms_hash;
        config.terms_uri = terms_uri.clone();
        config.terms_version = config
            .terms_version
            .checked_add(1)
            .ok_or(JpegPotError::ArithmeticOverflow)?;

        emit!(TermsPublished {
            version: config.terms_version,
            terms_hash,
            terms_uri,
        });
        Ok(())
    }

    pub fn deposit_metadata_asset(
        ctx: Context<DepositMetadataAsset>,
        commercial_rights_attested: bool,
        accepted_terms_hash: [u8; 32],
    ) -> Result<()> {
        validate_terms(&ctx.accounts.config, accepted_terms_hash)?;
        validate_metadata_asset(&ctx.accounts.metadata, ctx.accounts.mint.key())?;
        require!(
            ctx.accounts.source_token.amount == 1,
            JpegPotError::InvalidAssetAmount
        );
        require!(
            ctx.accounts.mint.decimals == 0,
            JpegPotError::InvalidAssetAmount
        );

        invoke_metadata_transfer(
            &ctx.accounts.metadata_program,
            &ctx.accounts.source_token,
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.vault_token,
            ctx.accounts.vault_authority.as_ref(),
            &ctx.accounts.mint,
            &ctx.accounts.metadata,
            ctx.accounts.edition.as_ref(),
            ctx.accounts.owner_token_record.as_ref(),
            ctx.accounts.vault_token_record.as_ref(),
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions,
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            ctx.accounts.authorization_rules_program.as_ref(),
            ctx.accounts.authorization_rules.as_ref(),
            None,
        )?;

        open_position(
            &mut ctx.accounts.config,
            &mut ctx.accounts.position,
            ctx.accounts.depositor.key(),
            ctx.accounts.mint.key(),
            ctx.accounts.source_token.key(),
            AssetStandard::TokenMetadata,
            commercial_rights_attested,
            ctx.bumps.position,
        )
    }

    pub fn withdraw_metadata_asset(ctx: Context<WithdrawMetadataAsset>) -> Result<()> {
        validate_withdrawal(
            &ctx.accounts.config,
            &ctx.accounts.position,
            Clock::get()?.unix_timestamp,
        )?;
        validate_metadata_asset(&ctx.accounts.metadata, ctx.accounts.mint.key())?;

        let signer_bump = [ctx.accounts.config.vault_bump];
        let signer_seeds: &[&[u8]] = &[VAULT_SEED, &signer_bump];
        invoke_metadata_transfer(
            &ctx.accounts.metadata_program,
            &ctx.accounts.vault_token,
            &ctx.accounts.vault_authority,
            &ctx.accounts.destination_token,
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.mint,
            &ctx.accounts.metadata,
            ctx.accounts.edition.as_ref(),
            ctx.accounts.vault_token_record.as_ref(),
            ctx.accounts.destination_token_record.as_ref(),
            &ctx.accounts.vault_authority,
            &ctx.accounts.depositor.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.sysvar_instructions,
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            ctx.accounts.authorization_rules_program.as_ref(),
            ctx.accounts.authorization_rules.as_ref(),
            Some(signer_seeds),
        )?;

        close_position(&mut ctx.accounts.config, &mut ctx.accounts.position)
    }

    pub fn deposit_core_asset(
        ctx: Context<DepositCoreAsset>,
        commercial_rights_attested: bool,
        accepted_terms_hash: [u8; 32],
    ) -> Result<()> {
        validate_terms(&ctx.accounts.config, accepted_terms_hash)?;
        require_keys_eq!(
            ctx.accounts.asset.owner,
            ctx.accounts.depositor.key(),
            JpegPotError::NotAssetOwner
        );

        let depositor_info = ctx.accounts.depositor.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let mut transfer = CoreTransferBuilder::new(&ctx.accounts.core_program);
        transfer
            .asset(ctx.accounts.asset.as_ref())
            .collection(
                ctx.accounts
                    .collection
                    .as_ref()
                    .map(|account| account.as_ref()),
            )
            .payer(&depositor_info)
            .authority(Some(&depositor_info))
            .new_owner(ctx.accounts.vault_authority.as_ref())
            .system_program(Some(&system_program_info));
        transfer.invoke()?;

        open_position(
            &mut ctx.accounts.config,
            &mut ctx.accounts.position,
            ctx.accounts.depositor.key(),
            ctx.accounts.asset.key(),
            Pubkey::default(),
            AssetStandard::Core,
            commercial_rights_attested,
            ctx.bumps.position,
        )
    }

    pub fn withdraw_core_asset(ctx: Context<WithdrawCoreAsset>) -> Result<()> {
        validate_withdrawal(
            &ctx.accounts.config,
            &ctx.accounts.position,
            Clock::get()?.unix_timestamp,
        )?;
        require_keys_eq!(
            ctx.accounts.asset.owner,
            ctx.accounts.vault_authority.key(),
            JpegPotError::InvalidVaultOwner
        );

        let signer_bump = [ctx.accounts.config.vault_bump];
        let signer_seeds: &[&[u8]] = &[VAULT_SEED, &signer_bump];
        let depositor_info = ctx.accounts.depositor.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();
        let mut transfer = CoreTransferBuilder::new(&ctx.accounts.core_program);
        transfer
            .asset(ctx.accounts.asset.as_ref())
            .collection(
                ctx.accounts
                    .collection
                    .as_ref()
                    .map(|account| account.as_ref()),
            )
            .payer(&depositor_info)
            .authority(Some(ctx.accounts.vault_authority.as_ref()))
            .new_owner(&depositor_info)
            .system_program(Some(&system_program_info));
        transfer.invoke_signed(&[signer_seeds])?;

        close_position(&mut ctx.accounts.config, &mut ctx.accounts.position)
    }

    pub fn lock_for_license(
        ctx: Context<LockForLicense>,
        licensed_until: i64,
        deal_hash: [u8; 32],
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(
            position.active && position.commercial_rights_attested,
            JpegPotError::PositionNotLicensable
        );
        require!(
            licensed_until > Clock::get()?.unix_timestamp,
            JpegPotError::InvalidLicensePeriod
        );
        require!(
            licensed_until > position.licensed_until,
            JpegPotError::InvalidLicensePeriod
        );
        position.licensed_until = licensed_until;
        emit!(PositionLicenseLocked {
            asset: position.asset,
            licensed_until,
            deal_hash,
        });
        Ok(())
    }

    pub fn deposit_revenue(
        ctx: Context<DepositRevenue>,
        amount: u64,
        source_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, JpegPotError::InvalidRevenueAmount);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.config.to_account_info(),
                },
            ),
            amount,
        )?;
        emit!(RevenueReceived {
            payer: ctx.accounts.payer.key(),
            amount,
            source_hash,
        });
        Ok(())
    }

    pub fn allocate_revenue(
        ctx: Context<AllocateRevenue>,
        amount: u64,
        purpose_hash: [u8; 32],
    ) -> Result<()> {
        require!(amount > 0, JpegPotError::InvalidRevenueAmount);
        let config_info = ctx.accounts.config.to_account_info();
        let recipient_info = ctx.accounts.recipient.to_account_info();
        let rent_floor = Rent::get()?.minimum_balance(config_info.data_len());
        let remaining = config_info
            .lamports()
            .checked_sub(amount)
            .ok_or(JpegPotError::InsufficientRevenue)?;
        require!(remaining >= rent_floor, JpegPotError::InsufficientRevenue);

        **config_info.try_borrow_mut_lamports()? = remaining;
        **recipient_info.try_borrow_mut_lamports()? = recipient_info
            .lamports()
            .checked_add(amount)
            .ok_or(JpegPotError::ArithmeticOverflow)?;

        emit!(RevenueAllocated {
            recipient: ctx.accounts.recipient.key(),
            amount,
            purpose_hash,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: Canonical PDA used only as a vault owner and CPI signer.
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(package_id: u64)]
pub struct CreateLicensePackage<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + LicensePackage::INIT_SPACE,
        seeds = [PACKAGE_SEED, &package_id.to_le_bytes()],
        bump
    )]
    pub license_package: Account<'info, LicensePackage>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageLicensePackage<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [PACKAGE_SEED, &license_package.id.to_le_bytes()],
        bump = license_package.bump
    )]
    pub license_package: Account<'info, LicensePackage>,
}

#[derive(Accounts)]
#[instruction(receipt_nonce: u64)]
pub struct PurchaseLicense<'info> {
    #[account(mut)]
    pub purchaser: Signer<'info>,
    /// CHECK: The receipt beneficiary may be any non-default address and never signs.
    pub beneficiary: UncheckedAccount<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [PACKAGE_SEED, &license_package.id.to_le_bytes()],
        bump = license_package.bump
    )]
    pub license_package: Account<'info, LicensePackage>,
    #[account(
        init,
        payer = purchaser,
        space = 8 + LicenseReceipt::INIT_SPACE,
        seeds = [
            RECEIPT_SEED,
            license_package.key().as_ref(),
            purchaser.key().as_ref(),
            &receipt_nonce.to_le_bytes()
        ],
        bump
    )]
    pub license_receipt: Account<'info, LicenseReceipt>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositMetadataAsset<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = depositor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, mint.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    /// CHECK: Canonical PDA used only as a vault owner.
    #[account(seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = depositor,
        token::token_program = token_program
    )]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program
    )]
    pub vault_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: PDA, owner, contents, and mint relationship are validated by `validate_metadata_asset`.
    #[account(mut, owner = mpl_token_metadata::ID)]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: Optional canonical edition account, validated by Token Metadata during CPI.
    #[account(mut)]
    pub edition: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional programmable-NFT token record, validated by Token Metadata during CPI.
    #[account(mut)]
    pub owner_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional programmable-NFT destination record, validated by Token Metadata during CPI.
    #[account(mut)]
    pub vault_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional rules program validated by its fixed executable address in Token Metadata CPI.
    pub authorization_rules_program: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional rule set validated by the authorization rules program.
    pub authorization_rules: Option<UncheckedAccount<'info>>,
    /// CHECK: Fixed Metaplex Token Metadata program.
    #[account(address = mpl_token_metadata::ID, executable)]
    pub metadata_program: UncheckedAccount<'info>,
    /// CHECK: Fixed instructions sysvar.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawMetadataAsset<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        close = depositor,
        seeds = [POSITION_SEED, mint.key().as_ref()],
        bump = position.bump,
        has_one = depositor,
        constraint = position.asset == mint.key() @ JpegPotError::InvalidPosition,
        constraint = position.origin_token_account == destination_token.key() @ JpegPotError::InvalidPosition,
        constraint = position.standard == AssetStandard::TokenMetadata @ JpegPotError::InvalidPosition
    )]
    pub position: Box<Account<'info, Position>>,
    /// CHECK: Canonical PDA used as the transfer authority.
    #[account(seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = vault_authority,
        token::token_program = token_program
    )]
    pub vault_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = depositor,
        token::token_program = token_program
    )]
    pub destination_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: PDA, owner, contents, and mint relationship are validated by `validate_metadata_asset`.
    #[account(mut, owner = mpl_token_metadata::ID)]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: Optional canonical edition account, validated by Token Metadata during CPI.
    #[account(mut)]
    pub edition: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional programmable-NFT source record, validated by Token Metadata during CPI.
    #[account(mut)]
    pub vault_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional programmable-NFT destination record, validated by Token Metadata during CPI.
    #[account(mut)]
    pub destination_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional fixed rules program consumed by Token Metadata.
    pub authorization_rules_program: Option<UncheckedAccount<'info>>,
    /// CHECK: Optional rule set validated by the authorization rules program.
    pub authorization_rules: Option<UncheckedAccount<'info>>,
    /// CHECK: Fixed Metaplex Token Metadata program.
    #[account(address = mpl_token_metadata::ID, executable)]
    pub metadata_program: UncheckedAccount<'info>,
    /// CHECK: Fixed instructions sysvar.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositCoreAsset<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = depositor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, asset.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    /// CHECK: Canonical PDA used only as a vault owner.
    #[account(seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub asset: Account<'info, BaseAssetV1>,
    pub collection: Option<Account<'info, mpl_core::accounts::BaseCollectionV1>>,
    /// CHECK: Fixed Metaplex Core program.
    #[account(address = mpl_core::ID, executable)]
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCoreAsset<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = depositor,
        seeds = [POSITION_SEED, asset.key().as_ref()],
        bump = position.bump,
        has_one = depositor,
        constraint = position.asset == asset.key() @ JpegPotError::InvalidPosition,
        constraint = position.standard == AssetStandard::Core @ JpegPotError::InvalidPosition
    )]
    pub position: Account<'info, Position>,
    /// CHECK: Canonical PDA used as the transfer authority.
    #[account(seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub asset: Account<'info, BaseAssetV1>,
    pub collection: Option<Account<'info, mpl_core::accounts::BaseCollectionV1>>,
    /// CHECK: Fixed Metaplex Core program.
    #[account(address = mpl_core::ID, executable)]
    pub core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockForLicense<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [POSITION_SEED, position.asset.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct DepositRevenue<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AllocateRevenue<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    /// CHECK: Receives SOL only and cannot be the zero address.
    #[account(mut, constraint = recipient.key() != Pubkey::default() @ JpegPotError::InvalidRecipient)]
    pub recipient: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub terms_hash: [u8; 32],
    #[max_len(200)]
    pub terms_uri: String,
    pub terms_version: u32,
    pub withdrawal_cooldown: i64,
    pub total_active_positions: u64,
    pub next_package_id: u64,
    pub total_license_receipts: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub depositor: Pubkey,
    pub asset: Pubkey,
    pub origin_token_account: Pubkey,
    pub deposited_at: i64,
    pub licensed_until: i64,
    pub terms_hash: [u8; 32],
    pub terms_version: u32,
    pub standard: AssetStandard,
    pub active: bool,
    pub commercial_rights_attested: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LicensePackage {
    pub id: u64,
    pub manifest_hash: [u8; 32],
    pub license_terms_hash: [u8; 32],
    pub native_price_lamports: u64,
    pub duration_seconds: i64,
    pub rights_source: RightsSource,
    pub active: bool,
    #[max_len(200)]
    pub metadata_uri: String,
    #[max_len(200)]
    pub license_uri: String,
    #[max_len(32)]
    pub position_assets: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LicenseReceipt {
    pub package: Pubkey,
    pub purchaser: Pubkey,
    pub beneficiary: Pubkey,
    pub issued_at: i64,
    pub valid_until: i64,
    pub amount_lamports: u64,
    pub manifest_hash: [u8; 32],
    pub license_terms_hash: [u8; 32],
    pub receipt_nonce: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum AssetStandard {
    TokenMetadata,
    Core,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum RightsSource {
    PublicDomain,
    DepositorAttestation,
}

#[event]
pub struct TermsPublished {
    pub version: u32,
    pub terms_hash: [u8; 32],
    pub terms_uri: String,
}

#[event]
pub struct PositionOpened {
    pub depositor: Pubkey,
    pub asset: Pubkey,
    pub standard: AssetStandard,
    pub commercial_rights_attested: bool,
    pub terms_version: u32,
    pub terms_hash: [u8; 32],
}

#[event]
pub struct PositionWithdrawn {
    pub depositor: Pubkey,
    pub asset: Pubkey,
}

#[event]
pub struct LicensePackageCreated {
    pub package: Pubkey,
    pub package_id: u64,
    pub manifest_hash: [u8; 32],
    pub license_terms_hash: [u8; 32],
    pub native_price_lamports: u64,
    pub duration_seconds: i64,
    pub rights_source: RightsSource,
    pub position_count: u8,
}

#[event]
pub struct LicensePackageAvailabilitySet {
    pub package: Pubkey,
    pub active: bool,
}

#[event]
pub struct LicensePurchased {
    pub receipt: Pubkey,
    pub package: Pubkey,
    pub package_id: u64,
    pub purchaser: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_lamports: u64,
    pub valid_until: i64,
    pub manifest_hash: [u8; 32],
    pub license_terms_hash: [u8; 32],
}

#[event]
pub struct PositionLicenseLocked {
    pub asset: Pubkey,
    pub licensed_until: i64,
    pub deal_hash: [u8; 32],
}

#[event]
pub struct RevenueReceived {
    pub payer: Pubkey,
    pub amount: u64,
    pub source_hash: [u8; 32],
}

#[event]
pub struct RevenueAllocated {
    pub recipient: Pubkey,
    pub amount: u64,
    pub purpose_hash: [u8; 32],
}

#[error_code]
pub enum JpegPotError {
    #[msg("The accepted license terms are not current")]
    InvalidTerms,
    #[msg("The withdrawal cooldown is invalid")]
    InvalidCooldown,
    #[msg("The supplied asset is not a supported NFT")]
    UnsupportedAsset,
    #[msg("The NFT amount or decimals are invalid")]
    InvalidAssetAmount,
    #[msg("The signer does not own this asset")]
    NotAssetOwner,
    #[msg("The asset is not owned by the vault")]
    InvalidVaultOwner,
    #[msg("The position is invalid")]
    InvalidPosition,
    #[msg("The position cannot be commercially licensed")]
    PositionNotLicensable,
    #[msg("The license period is invalid")]
    InvalidLicensePeriod,
    #[msg("The asset is still inside its withdrawal cooldown")]
    CooldownActive,
    #[msg("The asset is locked by an active commercial license")]
    AssetLicenseLocked,
    #[msg("The revenue amount is invalid")]
    InvalidRevenueAmount,
    #[msg("The revenue vault has insufficient spendable SOL")]
    InsufficientRevenue,
    #[msg("The revenue recipient is invalid")]
    InvalidRecipient,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("The license package is invalid")]
    InvalidPackage,
    #[msg("The license package contains too many positions")]
    TooManyPositions,
    #[msg("The package positions do not match the supplied accounts")]
    InvalidPackagePositions,
}

#[allow(clippy::too_many_arguments)]
fn validate_package_definition(
    manifest_hash: [u8; 32],
    license_terms_hash: [u8; 32],
    native_price_lamports: u64,
    duration_seconds: i64,
    rights_source: RightsSource,
    metadata_uri: &str,
    license_uri: &str,
    position_assets: &[Pubkey],
) -> Result<()> {
    require!(manifest_hash != [0; 32], JpegPotError::InvalidPackage);
    require!(license_terms_hash != [0; 32], JpegPotError::InvalidTerms);
    require!(
        native_price_lamports > 0,
        JpegPotError::InvalidRevenueAmount
    );
    require!(
        !metadata_uri.is_empty() && metadata_uri.len() <= 200,
        JpegPotError::InvalidPackage
    );
    require!(
        !license_uri.is_empty() && license_uri.len() <= 200,
        JpegPotError::InvalidTerms
    );
    require!(
        position_assets.len() <= MAX_POSITIONS_PER_PACKAGE,
        JpegPotError::TooManyPositions
    );
    for index in 0..position_assets.len() {
        require!(
            !position_assets[..index].contains(&position_assets[index]),
            JpegPotError::InvalidPackagePositions
        );
    }
    match rights_source {
        RightsSource::PublicDomain => {
            require!(
                position_assets.is_empty(),
                JpegPotError::InvalidPackagePositions
            );
            require!(duration_seconds >= 0, JpegPotError::InvalidLicensePeriod);
        }
        RightsSource::DepositorAttestation => {
            require!(
                !position_assets.is_empty(),
                JpegPotError::InvalidPackagePositions
            );
            require!(duration_seconds > 0, JpegPotError::InvalidLicensePeriod);
        }
    }
    Ok(())
}

fn compute_valid_until(now: i64, duration_seconds: i64) -> Result<i64> {
    if duration_seconds == 0 {
        return Ok(i64::MAX);
    }
    require!(duration_seconds > 0, JpegPotError::InvalidLicensePeriod);
    now.checked_add(duration_seconds)
        .ok_or_else(|| error!(JpegPotError::ArithmeticOverflow))
}

fn validate_position_accounts<'info>(
    program_id: &Pubkey,
    position_assets: &[Pubkey],
    accounts: &[AccountInfo<'info>],
    require_writable: bool,
) -> Result<()> {
    require!(
        accounts.len() == position_assets.len(),
        JpegPotError::InvalidPackagePositions
    );
    for (asset, account_info) in position_assets.iter().zip(accounts.iter()) {
        let expected = Pubkey::find_program_address(&[POSITION_SEED, asset.as_ref()], program_id).0;
        require_keys_eq!(
            account_info.key(),
            expected,
            JpegPotError::InvalidPackagePositions
        );
        require_keys_eq!(
            *account_info.owner,
            *program_id,
            JpegPotError::InvalidPackagePositions
        );
        if require_writable {
            require!(
                account_info.is_writable,
                JpegPotError::InvalidPackagePositions
            );
        }
        let data = account_info.try_borrow_data()?;
        let mut cursor: &[u8] = &data;
        let position = Position::try_deserialize(&mut cursor)
            .map_err(|_| error!(JpegPotError::InvalidPackagePositions))?;
        require!(
            position.asset == *asset && position.active && position.commercial_rights_attested,
            JpegPotError::PositionNotLicensable
        );
    }
    Ok(())
}

fn lock_package_positions<'info>(
    program_id: &Pubkey,
    position_assets: &[Pubkey],
    accounts: &[AccountInfo<'info>],
    valid_until: i64,
) -> Result<()> {
    for (asset, account_info) in position_assets.iter().zip(accounts.iter()) {
        let expected = Pubkey::find_program_address(&[POSITION_SEED, asset.as_ref()], program_id).0;
        require_keys_eq!(
            account_info.key(),
            expected,
            JpegPotError::InvalidPackagePositions
        );
        let mut data = account_info.try_borrow_mut_data()?;
        let mut read_cursor: &[u8] = &data;
        let mut position = Position::try_deserialize(&mut read_cursor)
            .map_err(|_| error!(JpegPotError::InvalidPackagePositions))?;
        if valid_until > position.licensed_until {
            position.licensed_until = valid_until;
            let mut write_cursor: &mut [u8] = &mut data;
            position.try_serialize(&mut write_cursor)?;
        }
    }
    Ok(())
}

fn validate_terms(config: &Config, accepted_terms_hash: [u8; 32]) -> Result<()> {
    require!(
        accepted_terms_hash == config.terms_hash,
        JpegPotError::InvalidTerms
    );
    Ok(())
}

fn validate_metadata_asset(metadata_account: &UncheckedAccount, mint: Pubkey) -> Result<()> {
    let expected = Metadata::find_pda(&mint).0;
    require_keys_eq!(
        metadata_account.key(),
        expected,
        JpegPotError::UnsupportedAsset
    );
    let data = metadata_account.try_borrow_data()?;
    let metadata =
        Metadata::from_bytes(&data).map_err(|_| error!(JpegPotError::UnsupportedAsset))?;
    require_keys_eq!(metadata.mint, mint, JpegPotError::UnsupportedAsset);
    let supported = matches!(
        metadata.token_standard,
        Some(TokenStandard::NonFungible)
            | Some(TokenStandard::NonFungibleEdition)
            | Some(TokenStandard::ProgrammableNonFungible)
            | Some(TokenStandard::ProgrammableNonFungibleEdition)
    );
    require!(supported, JpegPotError::UnsupportedAsset);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn invoke_metadata_transfer<'info>(
    metadata_program: &UncheckedAccount<'info>,
    source_token: &InterfaceAccount<'info, TokenAccount>,
    source_owner: &AccountInfo<'info>,
    destination_token: &InterfaceAccount<'info, TokenAccount>,
    destination_owner: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    metadata: &UncheckedAccount<'info>,
    edition: Option<&UncheckedAccount<'info>>,
    source_record: Option<&UncheckedAccount<'info>>,
    destination_record: Option<&UncheckedAccount<'info>>,
    authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    sysvar_instructions: &UncheckedAccount<'info>,
    token_program: &AccountInfo<'info>,
    associated_token_program: &AccountInfo<'info>,
    authorization_rules_program: Option<&UncheckedAccount<'info>>,
    authorization_rules: Option<&UncheckedAccount<'info>>,
    signer_seeds: Option<&[&[u8]]>,
) -> Result<()> {
    let mut transfer = MetadataTransferBuilder::new(metadata_program.as_ref());
    transfer
        .token(source_token.as_ref())
        .token_owner(source_owner)
        .destination_token(destination_token.as_ref())
        .destination_owner(destination_owner)
        .mint(mint.as_ref())
        .metadata(metadata.as_ref())
        .edition(edition.map(|account| account.as_ref()))
        .token_record(source_record.map(|account| account.as_ref()))
        .destination_token_record(destination_record.map(|account| account.as_ref()))
        .authority(authority)
        .payer(payer)
        .system_program(system_program)
        .sysvar_instructions(sysvar_instructions.as_ref())
        .spl_token_program(token_program)
        .spl_ata_program(associated_token_program)
        .authorization_rules_program(authorization_rules_program.map(|account| account.as_ref()))
        .authorization_rules(authorization_rules.map(|account| account.as_ref()))
        .amount(1);
    match signer_seeds {
        Some(seeds) => transfer.invoke_signed(&[seeds]).map_err(Into::into),
        None => transfer.invoke().map_err(Into::into),
    }
}

#[allow(clippy::too_many_arguments)]
fn open_position(
    config: &mut Account<Config>,
    position: &mut Account<Position>,
    depositor: Pubkey,
    asset: Pubkey,
    origin_token_account: Pubkey,
    standard: AssetStandard,
    commercial_rights_attested: bool,
    bump: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    position.depositor = depositor;
    position.asset = asset;
    position.origin_token_account = origin_token_account;
    position.deposited_at = now;
    position.licensed_until = 0;
    position.terms_hash = config.terms_hash;
    position.terms_version = config.terms_version;
    position.standard = standard;
    position.active = true;
    position.commercial_rights_attested = commercial_rights_attested;
    position.bump = bump;
    config.total_active_positions = config
        .total_active_positions
        .checked_add(1)
        .ok_or(JpegPotError::ArithmeticOverflow)?;

    emit!(PositionOpened {
        depositor,
        asset,
        standard,
        commercial_rights_attested,
        terms_version: config.terms_version,
        terms_hash: config.terms_hash,
    });
    Ok(())
}

fn validate_withdrawal(config: &Config, position: &Position, now: i64) -> Result<()> {
    require!(position.active, JpegPotError::InvalidPosition);
    let available_at = position
        .deposited_at
        .checked_add(config.withdrawal_cooldown)
        .ok_or(JpegPotError::ArithmeticOverflow)?;
    require!(now >= available_at, JpegPotError::CooldownActive);
    require!(
        now >= position.licensed_until,
        JpegPotError::AssetLicenseLocked
    );
    Ok(())
}

fn close_position(config: &mut Account<Config>, position: &mut Account<Position>) -> Result<()> {
    position.active = false;
    config.total_active_positions = config
        .total_active_positions
        .checked_sub(1)
        .ok_or(JpegPotError::ArithmeticOverflow)?;
    emit!(PositionWithdrawn {
        depositor: position.depositor,
        asset: position.asset,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(cooldown: i64) -> Config {
        Config {
            authority: Pubkey::new_unique(),
            terms_hash: [7; 32],
            terms_uri: "https://example.com/terms/v1".into(),
            terms_version: 1,
            withdrawal_cooldown: cooldown,
            total_active_positions: 1,
            next_package_id: 1,
            total_license_receipts: 0,
            bump: 1,
            vault_bump: 2,
        }
    }

    fn position(deposited_at: i64, licensed_until: i64) -> Position {
        Position {
            depositor: Pubkey::new_unique(),
            asset: Pubkey::new_unique(),
            origin_token_account: Pubkey::new_unique(),
            deposited_at,
            licensed_until,
            terms_hash: [7; 32],
            terms_version: 1,
            standard: AssetStandard::Core,
            active: true,
            commercial_rights_attested: true,
            bump: 3,
        }
    }

    #[test]
    fn withdrawal_obeys_cooldown_and_license_lock() {
        let config = config(100);
        let mut position = position(1_000, 0);
        assert!(validate_withdrawal(&config, &position, 1_099).is_err());
        assert!(validate_withdrawal(&config, &position, 1_100).is_ok());
        position.licensed_until = 1_200;
        assert!(validate_withdrawal(&config, &position, 1_199).is_err());
        assert!(validate_withdrawal(&config, &position, 1_200).is_ok());
    }

    #[test]
    fn terms_must_match_current_hash() {
        let config = config(0);
        assert!(validate_terms(&config, [7; 32]).is_ok());
        assert!(validate_terms(&config, [8; 32]).is_err());
    }

    #[test]
    fn public_domain_package_is_native_only_and_may_be_perpetual() {
        assert!(validate_package_definition(
            [1; 32],
            [2; 32],
            50_000_000,
            0,
            RightsSource::PublicDomain,
            "https://example.com/package/1",
            "https://creativecommons.org/publicdomain/zero/1.0/",
            &[],
        )
        .is_ok());
        assert_eq!(compute_valid_until(1_000, 0).unwrap(), i64::MAX);
        assert!(validate_package_definition(
            [1; 32],
            [2; 32],
            0,
            0,
            RightsSource::PublicDomain,
            "https://example.com/package/1",
            "https://creativecommons.org/publicdomain/zero/1.0/",
            &[],
        )
        .is_err());
    }

    #[test]
    fn depositor_package_requires_unique_positions_and_duration() {
        let asset = Pubkey::new_unique();
        assert!(validate_package_definition(
            [1; 32],
            [2; 32],
            10,
            86_400,
            RightsSource::DepositorAttestation,
            "https://example.com/package/1",
            "https://example.com/terms/1",
            &[asset],
        )
        .is_ok());
        assert!(validate_package_definition(
            [1; 32],
            [2; 32],
            10,
            86_400,
            RightsSource::DepositorAttestation,
            "https://example.com/package/1",
            "https://example.com/terms/1",
            &[asset, asset],
        )
        .is_err());
    }
}
