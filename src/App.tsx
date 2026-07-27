import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useSendTransaction, useWalletConnection } from "@solana/react-hooks";
import { erc1155Abi, erc721Abi, evmChains, evmPaymentNetworks, licensingAbi, vaultAbi } from "./lib/evm";
import { assetLabel, isConfiguredAddress, shortenAddress, supportedNetworks } from "./lib/product";
import { catalogAssets, catalogCategories, type CatalogAsset, type CatalogCategory } from "./lib/catalog";
import {
  createReceiptNonce,
  createSolanaPurchasePlan,
  simulateSolanaPurchase,
  solanaCluster,
  type SolanaPurchasePlan,
} from "./lib/solana";
import {
  LICENSE_TERMS_HASH,
  LICENSE_TERMS_LEDE,
  LICENSE_TERMS_LEGAL_NOTE,
  LICENSE_TERMS_SECTIONS,
  LICENSE_TERMS_TITLE,
  LICENSE_TERMS_VERSION,
} from "./lib/licenseTerms";
import {
  TERMS_HASH,
  TERMS_LEDE,
  TERMS_LEGAL_NOTE,
  TERMS_SECTIONS,
  TERMS_TITLE,
  TERMS_VERSION,
} from "./lib/terms";

const vaultAddress = import.meta.env.VITE_EVM_VAULT_ADDRESS;
const solanaProgramId = import.meta.env.VITE_SOLANA_PROGRAM_ID;

type Family = "evm" | "solana";
type EvmStandard = "ERC-721" | "ERC-1155";

function Mark() {
  return <span className="brand-mark" aria-hidden="true">JP</span>;
}

function PackVisual({ asset }: { asset: CatalogAsset }) {
  return <div className={`pack-visual ${asset.visual}`} aria-hidden="true"><i /><i /><i /><span>{asset.category}</span></div>;
}

function EvmWallet() {
  const { address, chain, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return <button className="wallet-button wallet-button--connected" onClick={() => disconnect()}><span className="wallet-dot" />{shortenAddress(address)} · {chain?.name ?? "EVM"}</button>;
  }

  const connector = connectors[0];
  return <button className="wallet-button" disabled={!connector || isPending} onClick={() => connector && connect({ connector })}>{isPending ? "Opening wallet…" : "Connect EVM wallet"}</button>;
}

function SolanaWallet() {
  const { connectors, connect, disconnect, wallet, status, currentConnector } = useWalletConnection();
  if (status === "connected" && wallet) {
    return <button className="wallet-button wallet-button--connected" onClick={() => void disconnect()}><span className="wallet-dot" />{shortenAddress(wallet.account.address.toString())} · {currentConnector?.name}</button>;
  }
  return <div className="wallet-list">{connectors.length === 0 ? <button className="wallet-button" disabled>Open in a Solana wallet browser</button> : connectors.slice(0, 3).map((connector) => <button className="wallet-button" key={connector.id} disabled={status === "connecting"} onClick={() => void connect(connector.id)}>Connect {connector.name}</button>)}</div>;
}

function PotVisual() {
  return (
    <div className="pot-machine" aria-label="NFT prize pot illustration">
      <div className="pot-orbit pot-orbit--one">LOW<br />ODDS</div>
      <div className="pot-orbit pot-orbit--two">OLD<br />BAGS</div>
      <div className="falling-cards"><span>404</span><span>JPEG</span><span>?</span><span>RUG</span></div>
      <div className="pot-mouth"><span>THE POT</span></div>
      <div className="pot-body"><b>$POT</b><i /><i /><i /></div>
      <div className="pot-caption">NFTs IN · PRIZES OUT</div>
    </div>
  );
}

function PrizeBoard() {
  return (
    <aside className="prize-board" id="prize">
      <div className="prize-board__status"><span>● TESTNET PREVIEW</span><b>DRAW NOT ACTIVE</b></div>
      <div className="prize-amount"><span>THIS WEEK’S POT</span><strong>0.00</strong><small>NATIVE CRYPTO</small></div>
      <div className="prize-stats"><div><span>NFT POSITIONS</span><strong>0</strong></div><div><span>NEXT DRAW</span><strong>—</strong></div><div><span>YOUR TICKETS</span><strong>0</strong></div></div>
      <a href="#enter" className="acid-action">THROW AN NFT IN ↘</a>
      <p>No real prize is active. Contracts and public prize policy must be deployed before entries count.</p>
    </aside>
  );
}

function LicensePackModal({ asset, onClose }: { asset: CatalogAsset; onClose: () => void }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: transactionHash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const solanaWallet = useWalletConnection();
  const solanaTransaction = useSendTransaction();
  const [family, setFamily] = useState<Family>("evm");
  const [selectedChainId, setSelectedChainId] = useState<(typeof evmPaymentNetworks)[number]["chainId"]>(80002);
  const [solanaPlan, setSolanaPlan] = useState<SolanaPurchasePlan | null>(null);
  const [simulationUnits, setSimulationUnits] = useState<bigint | null>(null);
  const [notice, setNotice] = useState("");
  const network = evmPaymentNetworks.find((item) => item.chainId === selectedChainId) ?? evmPaymentNetworks[0];
  const licensingAddress = network.licensingAddress;
  const evmConfigured = !asset.isPreview && isConfiguredAddress(licensingAddress);
  const solanaConfigured = !asset.isPreview && Boolean(solanaProgramId);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function payEvm() {
    if (!evmConfigured || !licensingAddress || !address) return;
    setNotice("");
    try {
      if (chainId !== network.chainId) await switchChainAsync({ chainId: network.chainId });
      await writeContractAsync({ abi: licensingAbi, address: licensingAddress, chainId: network.chainId, functionName: "purchaseNative", args: [asset.packageId, address], value: asset.nativePrice });
      setNotice(`Submitted on ${network.name}. The receipt appears after confirmation.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message.split("\n")[0] : "Purchase cancelled");
    }
  }

  async function simulateSolana() {
    if (!solanaProgramId || !solanaWallet.wallet || !solanaConfigured) return;
    setNotice(""); setSolanaPlan(null); setSimulationUnits(null);
    try {
      const walletAddress = solanaWallet.wallet.account.address.toString();
      const plan = await createSolanaPurchasePlan({ programId: solanaProgramId, packageId: asset.packageId, purchaser: walletAddress, beneficiary: walletAddress, receiptNonce: createReceiptNonce() });
      const simulation = await simulateSolanaPurchase(plan);
      if (!simulation.ok) throw new Error(`Simulation failed: ${JSON.stringify(simulation.error)}`);
      setSolanaPlan(plan); setSimulationUnits(simulation.unitsConsumed); setNotice("Simulation passed. Review every field before approving.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Solana simulation failed");
    }
  }

  async function sendSolana() {
    if (!solanaPlan || !solanaWallet.wallet) return;
    setNotice("");
    try {
      const signature = await solanaTransaction.send({ instructions: [solanaPlan.instruction], feePayer: solanaPlan.purchaser, authority: solanaWallet.wallet, commitment: "confirmed" }, { commitment: "confirmed", skipPreflight: false });
      setNotice(`License submitted: ${shortenAddress(signature.toString(), 9)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Solana purchase cancelled");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="license-modal" role="dialog" aria-modal="true" aria-labelledby="pack-title">
        <button className="modal-close" type="button" aria-label="Close license pack" onClick={onClose}>×</button>
        <div className="license-art"><PackVisual asset={asset} /><span>MEDIA PACK PREVIEW</span></div>
        <div className="license-copy">
          <p className="eyebrow">{asset.category} · {asset.chain}</p>
          <h2 id="pack-title">{asset.name}</h2>
          <p className="license-summary">{asset.licenseSummary}</p>
          <div className="license-facts"><div><span>SOURCE</span><strong>NFT-linked media</strong></div><div><span>STANDARD</span><strong>{asset.standard}</strong></div><div><span>LICENSE</span><strong>{asset.licenseLabel}</strong></div><div><span>SETTLEMENT</span><strong>Native crypto</strong></div></div>
          <div className="license-tags">{asset.permittedUses.map((use) => <span key={use}>✓ {use}</span>)}</div>
          <div className="pack-revenue-note"><strong>WHY THIS MATTERS TO THE POT</strong><p>When a reviewed pack is licensed, its payment becomes protocol revenue that can fund prizes, member drops, operating reserves, and transparent $POT buy-and-burn allocations.</p></div>
          <div className="preview-warning">Preview only. This is not a live NFT or purchasable media package.</div>
          <div className="checkout-box">
            <div className="checkout-price"><span>PACK PRICE</span><strong>{family === "solana" ? asset.solanaPriceLabel : `${asset.nativePriceLabel} ${network.symbol}`}</strong></div>
            <div className="chain-tabs" role="tablist" aria-label="Payment blockchain family"><button className={family === "evm" ? "active" : ""} onClick={() => setFamily("evm")}>EVM</button><button className={family === "solana" ? "active" : ""} onClick={() => setFamily("solana")}>SOLANA</button></div>
            {family === "evm" ? <div className="chain-checkout-panel"><label className="checkout-network"><span>PAYMENT NETWORK</span><select value={selectedChainId} onChange={(event) => setSelectedChainId(Number(event.target.value) as (typeof evmPaymentNetworks)[number]["chainId"])}>{evmPaymentNetworks.map((item) => <option value={item.chainId} key={item.chainId}>{item.name} · {item.symbol}</option>)}</select></label><div className="transaction-review"><div><span>RECIPIENT</span><code>PREVIEW ONLY</code></div><div><span>AMOUNT</span><code>{asset.nativePriceLabel} {network.symbol}</code></div><div><span>PACKAGE</span><code>#{asset.packageId.toString()}</code></div><div><span>NETWORK</span><code>{network.name}</code></div></div><EvmWallet /><button className="acid-action" disabled={!evmConfigured || !isConnected || isPending} onClick={() => void payEvm()}>{isPending ? "CONFIRM IN WALLET…" : "LICENSE THIS PACK"}</button></div> : <div className="chain-checkout-panel"><SolanaWallet /><div className="transaction-review"><div><span>RECIPIENT</span><code>PREVIEW ONLY</code></div><div><span>AMOUNT</span><code>{asset.solanaPriceLabel}</code></div><div><span>FEE PAYER</span><code>{solanaWallet.wallet ? shortenAddress(solanaWallet.wallet.account.address.toString(), 9) : "CONNECT WALLET"}</code></div><div><span>CLUSTER</span><code>{solanaCluster}</code></div></div>{!solanaPlan ? <button className="outline-action" disabled={!solanaConfigured || !solanaWallet.wallet} onClick={() => void simulateSolana()}>SIMULATE LICENSE</button> : <button className="acid-action" disabled={solanaTransaction.isSending} onClick={() => void sendSolana()}>APPROVE IN WALLET</button>}{simulationUnits !== null && <p className="simulation-proof">SIMULATION PASSED · {simulationUnits.toString()} UNITS</p>}</div>}
            {(notice || receipt.isSuccess) && <p className="notice">{receipt.isSuccess ? "Receipt confirmed onchain." : notice}</p>}
          </div>
          <code className="manifest-hash">MANIFEST {shortenAddress(asset.manifestHash, 8)} · TERMS {shortenAddress(LICENSE_TERMS_HASH, 8)}</code>
        </div>
      </section>
    </div>
  );
}

function DepositPanel() {
  const [family, setFamily] = useState<Family>("evm");
  const [standard, setStandard] = useState<EvmStandard>("ERC-721");
  const [collection, setCollection] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [amount, setAmount] = useState("1");
  const [rights, setRights] = useState(false);
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, data: transactionHash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const configured = isConfiguredAddress(vaultAddress);
  const validAsset = /^0x[0-9a-fA-F]{40}$/.test(collection) && /^\d+$/.test(tokenId);
  const canDeposit = configured && isConnected && validAsset;
  const preview = useMemo(() => assetLabel(standard, collection, tokenId), [standard, collection, tokenId]);

  async function approveAsset() {
    if (!canDeposit || !vaultAddress) return;
    setNotice("");
    try {
      if (standard === "ERC-721") await writeContractAsync({ abi: erc721Abi, address: collection as `0x${string}`, functionName: "approve", args: [vaultAddress, BigInt(tokenId)] });
      else await writeContractAsync({ abi: erc1155Abi, address: collection as `0x${string}`, functionName: "setApprovalForAll", args: [vaultAddress, true] });
      setApproved(true); setNotice("Approval submitted. Wait for confirmation, then enter the pot.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message.split("\n")[0] : "Approval cancelled");
    }
  }

  async function depositAsset() {
    if (!canDeposit || !vaultAddress || !approved) return;
    setNotice("");
    try {
      if (standard === "ERC-721") await writeContractAsync({ abi: vaultAbi, address: vaultAddress, functionName: "depositERC721", args: [collection as `0x${string}`, BigInt(tokenId), TERMS_HASH, rights] });
      else await writeContractAsync({ abi: vaultAbi, address: vaultAddress, functionName: "depositERC1155", args: [collection as `0x${string}`, BigInt(tokenId), BigInt(amount), TERMS_HASH, rights] });
      setNotice("Position submitted. It becomes a pool entry after network confirmation.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message.split("\n")[0] : "Deposit cancelled");
    }
  }

  return (
    <div className="deposit-panel">
      <div className="deposit-head"><div><span>ENTER THE POT</span><h3>Put an old NFT back in the game.</h3></div><small>TESTNET</small></div>
      <div className="family-tabs"><button className={family === "evm" ? "active" : ""} onClick={() => setFamily("evm")}>EVM BAG</button><button className={family === "solana" ? "active" : ""} onClick={() => setFamily("solana")}>SOLANA BAG</button></div>
      {family === "evm" ? <div className="deposit-form"><div className="field field--wide"><label>Wallet</label><EvmWallet /></div><div className="field"><label htmlFor="network">Chain</label><select id="network" value={chainId ?? 80002} onChange={(event) => switchChain({ chainId: Number(event.target.value) as 80002 | 137 | 1 | 8453 | 42161 })}>{evmChains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}</select></div><div className="field"><label htmlFor="standard">Standard</label><select id="standard" value={standard} onChange={(event) => setStandard(event.target.value as EvmStandard)}><option>ERC-721</option><option>ERC-1155</option></select></div><div className="field field--wide"><label htmlFor="collection">Collection contract</label><input id="collection" placeholder="0x…" value={collection} onChange={(event) => setCollection(event.target.value)} /></div><div className="field"><label htmlFor="token">Token ID</label><input id="token" inputMode="numeric" placeholder="Your bag’s token ID" value={tokenId} onChange={(event) => setTokenId(event.target.value)} /></div><div className="field"><label htmlFor="amount">Amount</label><input id="amount" inputMode="numeric" disabled={standard === "ERC-721"} value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="position-preview field--wide"><span>POOL POSITION</span><strong>{preview}</strong></div><label className="rights-check field--wide"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /><span><strong>Optional: I can grant commercial media rights</strong>Leave this unchecked if you only want a pool position. Checked NFTs require rights review before their media can earn licensing revenue.</span></label>{!configured && <p className="launch-note field--wide">Preview mode: deposits unlock after an audited vault and prize policy are published.</p>}<div className="action-row field--wide"><button className="outline-action" disabled={!canDeposit || isPending} onClick={() => void approveAsset()}>{approved ? "01 · APPROVED" : "01 · APPROVE NFT"}</button><button className="acid-action" disabled={!canDeposit || !approved || isPending} onClick={() => void depositAsset()}>{isPending ? "CONFIRM IN WALLET…" : "02 · THROW IT IN"}</button></div>{(notice || receipt.isSuccess) && <p className="notice field--wide">{receipt.isSuccess ? "Your position is confirmed." : notice}</p>}</div> : <div className="solana-panel"><SolanaWallet /><div className="standard-tags"><span>Token Metadata</span><span>pNFT</span><span>Token-2022</span><span>Core</span></div><p>Connect your wallet, choose the NFT, and simulate the deposit before signing. Rights attestation stays optional.</p><button className="acid-action" disabled={!solanaProgramId}>{solanaProgramId ? "BUILD SOLANA ENTRY" : "PROGRAM DEPLOYMENT PENDING"}</button></div>}
    </div>
  );
}

function Marketplace({ onSelect }: { onSelect: (asset: CatalogAsset) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All media" | CatalogCategory>("All media");
  const [chain, setChain] = useState("All chains");
  const [license, setLicense] = useState("All licenses");
  const [sort, setSort] = useState("Featured");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = catalogAssets.filter((asset) => {
      const searchable = [asset.name, asset.category, asset.chain, asset.standard, asset.licenseLabel, ...asset.permittedUses].join(" ").toLowerCase();
      return (!normalized || searchable.includes(normalized))
        && (category === "All media" || asset.category === category)
        && (chain === "All chains" || asset.chain === chain)
        && (license === "All licenses" || asset.licenseLabel === license);
    });
    if (sort === "Name A–Z") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Chain") return [...filtered].sort((a, b) => a.chain.localeCompare(b.chain));
    return filtered;
  }, [category, chain, license, query, sort]);

  return (
    <section className="media-marketplace" id="marketplace">
      <div className="marketplace-heading">
        <div><p className="eyebrow">FOR MEDIA BUYERS</p><h2>Search NFT media.<br />License it onchain.</h2></div>
        <p>Browse commercial-use media connected to deposited NFTs. Every live listing will show its rights source, permitted uses, source chain, and an onchain license receipt before payment.</p>
      </div>

      <div className="marketplace-search">
        <label htmlFor="media-search">SEARCH THE LIBRARY</label>
        <div><span aria-hidden="true">⌕</span><input id="media-search" type="search" placeholder="Try “abstract campaign,” “characters,” or “gaming”…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button">SEARCH</button></div>
        <p>Popular: <button onClick={() => setQuery("campaign")}>Campaign</button><button onClick={() => setQuery("editorial")}>Editorial</button><button onClick={() => setQuery("gaming")}>Gaming</button><button onClick={() => setQuery("social")}>Social</button></p>
      </div>

      <div className="marketplace-controls">
        <div className="category-filter" aria-label="Media categories">{catalogCategories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="select-filters">
          <label>CHAIN<select value={chain} onChange={(event) => setChain(event.target.value)}><option>All chains</option>{[...new Set(catalogAssets.map((asset) => asset.chain))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>LICENSE<select value={license} onChange={(event) => setLicense(event.target.value)}><option>All licenses</option><option>Commercial</option><option>Extended</option></select></label>
          <label>SORT<select value={sort} onChange={(event) => setSort(event.target.value)}><option>Featured</option><option>Name A–Z</option><option>Chain</option></select></label>
        </div>
      </div>

      <div className="results-heading"><div><strong>{results.length} MEDIA PREVIEWS</strong><span>REAL LISTINGS REQUIRE OWNERSHIP + RIGHTS REVIEW</span></div><p>CRYPTO PAYMENT · ONCHAIN RECEIPT · NO NFT TRANSFER</p></div>
      {results.length > 0 ? <div className="media-grid">{results.map((asset) => <article className="media-card" key={asset.slug}>
        <button className="media-card__visual" onClick={() => onSelect(asset)} aria-label={`View ${asset.name}`}><PackVisual asset={asset} /><span className="preview-chip">PREVIEW</span><span className="license-chip">{asset.licenseLabel}</span></button>
        <div className="media-card__body"><div className="media-card__title"><div><strong>{asset.name}</strong><small>{asset.category} · {asset.standard}</small></div><b>{asset.chain === "Solana" ? asset.solanaPriceLabel : asset.nativePriceLabel}<span>{asset.chain === "Solana" ? "SOLANA" : "NATIVE TOKEN"}</span></b></div><p>{asset.licenseSummary}</p><div className="media-card__meta"><span>{asset.chain}</span><span>{asset.permittedUses.slice(0, 2).join(" · ")}</span></div><button className="card-license" onClick={() => onSelect(asset)}>VIEW LICENSE ↗</button></div>
      </article>)}</div> : <div className="empty-results"><strong>No previews match those filters.</strong><button onClick={() => { setQuery(""); setCategory("All media"); setChain("All chains"); setLicense("All licenses"); }}>CLEAR FILTERS</button></div>}
      <p className="catalog-disclaimer">Catalog interface demonstration. These abstract previews are not real NFTs or live offers. Production inventory appears only after onchain ownership verification and legal rights review.</p>
    </section>
  );
}

function Terms() {
  return <main className="terms-page"><a href="/" className="back-link">← JPEG POT</a><p className="eyebrow">POOL MEMBER TERMS · VERSION {TERMS_VERSION}</p><h1>{TERMS_TITLE}</h1><p className="terms-lede">{TERMS_LEDE}</p>{TERMS_SECTIONS.map(({ title, body }) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p className="legal-note">{TERMS_LEGAL_NOTE}</p></main>;
}

function LicenseTerms() {
  return <main className="terms-page"><a href="/" className="back-link">← JPEG POT</a><p className="eyebrow">MEDIA BUYER TERMS · VERSION {LICENSE_TERMS_VERSION}</p><h1>{LICENSE_TERMS_TITLE}</h1><p className="terms-lede">{LICENSE_TERMS_LEDE}</p>{LICENSE_TERMS_SECTIONS.map(({ title, body }) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p className="legal-note">{LICENSE_TERMS_LEGAL_NOTE}</p><code className="terms-hash">TERMS HASH · {LICENSE_TERMS_HASH}</code></main>;
}

export default function App() {
  const routeAsset = window.location.pathname.match(/^\/pack\/([a-z0-9-]+)$/);
  const initialAsset = routeAsset ? catalogAssets.find((asset) => asset.slug === routeAsset[1]) ?? null : null;
  const [selectedAsset, setSelectedAsset] = useState<CatalogAsset | null>(initialAsset);
  if (window.location.pathname.startsWith("/terms/")) return <Terms />;
  if (window.location.pathname.startsWith("/license/")) return <LicenseTerms />;
  function selectAsset(asset: CatalogAsset) { window.history.pushState({}, "", `/pack/${asset.slug}`); setSelectedAsset(asset); }
  function closeAsset() { window.history.pushState({}, "", "/"); setSelectedAsset(null); }

  return (
    <>
      <header className="site-header"><a href="#top" className="brand-link"><Mark /><strong>JPEG POT</strong><span>THE NFT PRIZE + MEDIA MARKET</span></a><nav><a href="#marketplace">License media</a><a href="#enter">Enter the pot</a><a href="#how">How it works</a><a href="#flywheel">Rewards</a></nav><a className="header-action" href="#enter">THROW IT IN</a></header>
      <main id="top">
        <section className="hero"><div className="hero-copy"><p className="eyebrow">ONE POOL · TWO WAYS IN</p><h1>Give old NFTs <em>one more shot.</em></h1><p className="hero-lede">Holders put idle NFTs into a prize pool. Media buyers search and license rights-cleared work with crypto. Those licensing payments can refill the pot—without selling the underlying NFTs.</p><div className="hero-actions"><a href="#enter" className="acid-action">THROW AN NFT IN ↘</a><a href="#marketplace" className="outline-action">SEARCH NFT MEDIA</a></div><div className="hero-proof"><span>NO NFT SALE</span><span>SEARCHABLE MEDIA</span><span>MULTICHAIN</span><span>ONCHAIN LICENSES</span></div></div><PotVisual /><PrizeBoard /></section>
        <section className="ticker"><span>OLD BAGS</span><b>✦</b><span>LOW ODDS</span><b>✦</b><span>ONE MORE CHANCE</span><b>✦</b><span>LICENSING FEEDS THE POT</span><b>✦</b><span>NFTS IN · PRIZES OUT</span></section>

        <Marketplace onSelect={selectAsset} />

        <section className="premise" id="how"><div className="premise-heading"><p className="eyebrow">THE ORIGINAL IDEA</p><h2>A PoolTogether-style game, but the entries are NFTs.</h2><p>PoolTogether pools token yield for prize odds. JPEG Pot pools idle NFT positions and uses media-licensing revenue as a potential prize and rewards source. The NFT is never sold to create the prize.</p></div><div className="game-steps"><article><span>01</span><h3>Deposit your bag</h3><p>Lock a supported NFT in its chain-local vault. Every active position becomes part of the pool.</p></article><article><span>02</span><h3>Get a chance</h3><p>The published prize policy determines tickets and eligibility. Bad floor price does not need to mean zero utility.</p></article><article><span>03</span><h3>Licenses add fuel</h3><p>Only rights-cleared NFTs can enter media packs. Buyer payments accumulate as transparent pool revenue.</p></article><article><span>04</span><h3>Rewards leave the pot</h3><p>Revenue can be allocated to prize winners, member drops, reserves, or verifiable $POT buy-and-burn activity.</p></article></div></section>

        <section className="eligibility"><div><p className="eyebrow">TWO WAYS TO PLAY</p><h2>Every bag can enter. Only verified rights can be sold.</h2></div><div className="eligibility-cards"><article><span>POOL POSITION</span><h3>No media rights?</h3><p>That is okay. Deposit without an attestation. The NFT can count as a membership position but stays out of commercial license packs.</p><b>PRIZE ELIGIBILITY · NO LICENSING</b></article><article className="rights-enabled"><span>RIGHTS-ENABLED POSITION</span><h3>Can license the art?</h3><p>Attest the rights source, pass review, and let the NFT’s media join paid creative packs that help feed the ecosystem.</p><b>PRIZE ELIGIBILITY · LICENSING UPSIDE</b></article></div></section>

        <section className="enter-section" id="enter"><div className="enter-copy"><p className="eyebrow">YOUR BAG’S SECOND LIFE</p><h2>Put it in the pot.</h2><p>Connect on mobile, choose an NFT, and decide whether you can also grant commercial media rights. Nothing is live until audited contracts and a public prize policy are deployed.</p><ul><li>Keep beneficial ownership of the NFT</li><li>Withdraw after the cooldown and active licenses</li><li>Never share a seed phrase or private key</li></ul></div><DepositPanel /></section>

        <section className="flywheel" id="flywheel"><div className="flywheel-heading"><p className="eyebrow">THE $POT FLYWHEEL</p><h2>The weird art funds the game.</h2><p>Licensing is not the brand. It is the engine that gives a pool of idle NFTs an external revenue source.</p></div><div className="flywheel-loop"><article><span>01</span><strong>Rights-cleared NFTs</strong><small>reviewed media</small></article><b>→</b><article><span>02</span><strong>Media packs</strong><small>commercial use</small></article><b>→</b><article><span>03</span><strong>Native crypto</strong><small>license revenue</small></article><b>→</b><article><span>04</span><strong>Prize + $POT</strong><small>published allocation</small></article></div><div className="allocation-grid"><article><strong>PRIZES</strong><p>Native-crypto rewards allocated under a public prize policy.</p></article><article><strong>MEMBER DROPS</strong><p>Transparent distributions to eligible pool participants.</p></article><article><strong>BUY & BURN</strong><p>Onchain $POT purchases and supply reduction.</p></article><article><strong>RESERVES</strong><p>Auditable operating and future prize liquidity.</p></article></div></section>

        <section className="chains"><div><p className="eyebrow">CHAIN-LOCAL VAULTS</p><h2>One pot. No bridge custody.</h2></div><div className="chain-grid">{supportedNetworks.map((network) => <article key={network.name}><span>{network.mark}</span><div><strong>{network.name}</strong><small>{network.status.replace("-", " ")}</small></div></article>)}</div></section>

        <section className="faq"><p className="eyebrow">BEFORE YOU APE</p><h2>Read this part.</h2><div><details><summary>Do I lose my NFT?<span>+</span></summary><p>Not through a sale. The NFT is held by a chain-local vault and can be withdrawn after its cooldown, provided no accepted media license is still active.</p></details><details><summary>Does my NFT need commercial rights?<span>+</span></summary><p>No. Rights are optional for pool membership. Without a reviewed rights source, the NFT is excluded from media licensing.</p></details><details><summary>Are prizes live?<span>+</span></summary><p>No. This is a testnet product preview. A production prize game needs audited contracts, a published allocation and draw policy, funding, and jurisdiction-specific legal review.</p></details><details><summary>Where does prize money come from?<span>+</span></summary><p>The intended external source is native-crypto revenue from licensed media packages. The vault can allocate received revenue to winners, member distributors, reserves, or a buy-and-burn executor.</p></details></div></section>
      </main>
      <footer><div className="footer-brand"><Mark /><div><strong>JPEG POT</strong><span>Your bags. One more chance.</span></div></div><div><a href="#marketplace">Browse media</a><a href="#enter">Enter</a><a href="#flywheel">Rewards</a><a href="/terms/v1">Member terms</a><a href="/license/v1">Buyer terms</a></div><p>TESTNET PREVIEW · NO ACTIVE PRIZE</p></footer>
      {selectedAsset && <LicensePackModal asset={selectedAsset} onClose={closeAsset} />}
    </>
  );
}
