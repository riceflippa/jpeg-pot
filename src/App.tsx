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
import { isConfiguredAddress, shortenAddress, supportedNetworks } from "./lib/product";
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

function PoolPreview() {
  return (
    <aside className="pool-preview" aria-label="JPEG Pot testnet preview">
      <div className="pool-preview__status"><span>PUBLIC TESTNET</span><b>NO ACTIVE DRAW</b></div>
      <div className="pool-preview__amount"><span>Current prize pool</span><strong>0.00</strong><small>native crypto</small></div>
      <div className="pool-preview__flow">
        <div><span>01</span><strong>Deposit</strong><small>an idle NFT</small></div>
        <div><span>02</span><strong>License</strong><small>verified media</small></div>
        <div><span>03</span><strong>Reward</strong><small>the pool</small></div>
      </div>
      <p>Licensing revenue can fund future prizes and transparent $POT rewards.</p>
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
        <div className="license-art"><PackVisual asset={asset} /><span>PREVIEW INVENTORY</span></div>
        <div className="license-copy">
          <p className="eyebrow">{asset.category} · {asset.chain}</p>
          <h2 id="pack-title">{asset.name}</h2>
          <p className="license-summary">{asset.licenseSummary}</p>
          <div className="license-facts"><div><span>SOURCE</span><strong>NFT-linked media</strong></div><div><span>STANDARD</span><strong>{asset.standard}</strong></div><div><span>LICENSE</span><strong>{asset.licenseLabel}</strong></div></div>
          <div className="license-tags">{asset.permittedUses.map((use) => <span key={use}>✓ {use}</span>)}</div>
          <div className="preview-warning">Demo listing only—no real NFT or license is for sale.</div>
          <div className="checkout-box">
            <div className="checkout-price"><span>LICENSE PRICE</span><strong>{family === "solana" ? asset.solanaPriceLabel : `${asset.nativePriceLabel} ${network.symbol}`}</strong></div>
            <div className="chain-tabs" role="tablist" aria-label="Payment blockchain family"><button className={family === "evm" ? "active" : ""} onClick={() => setFamily("evm")}>EVM</button><button className={family === "solana" ? "active" : ""} onClick={() => setFamily("solana")}>SOLANA</button></div>
            {family === "evm" ? <div className="chain-checkout-panel"><label className="checkout-network"><span>NETWORK</span><select value={selectedChainId} onChange={(event) => setSelectedChainId(Number(event.target.value) as (typeof evmPaymentNetworks)[number]["chainId"])}>{evmPaymentNetworks.map((item) => <option value={item.chainId} key={item.chainId}>{item.name} · {item.symbol}</option>)}</select></label><div className="transaction-review"><div><span>RECIPIENT</span><code>PREVIEW ONLY</code></div><div><span>AMOUNT</span><code>{asset.nativePriceLabel} {network.symbol}</code></div><div><span>PACKAGE</span><code>#{asset.packageId.toString()}</code></div><div><span>NETWORK</span><code>{network.name}</code></div></div><EvmWallet /><button className="acid-action" disabled={!evmConfigured || !isConnected || isPending} onClick={() => void payEvm()}>{isPending ? "CONFIRM IN WALLET…" : "LICENSE MEDIA"}</button></div> : <div className="chain-checkout-panel"><SolanaWallet /><div className="transaction-review"><div><span>RECIPIENT</span><code>PREVIEW ONLY</code></div><div><span>AMOUNT</span><code>{asset.solanaPriceLabel}</code></div><div><span>FEE PAYER</span><code>{solanaWallet.wallet ? shortenAddress(solanaWallet.wallet.account.address.toString(), 9) : "CONNECT WALLET"}</code></div><div><span>CLUSTER</span><code>{solanaCluster}</code></div></div>{!solanaPlan ? <button className="outline-action" disabled={!solanaConfigured || !solanaWallet.wallet} onClick={() => void simulateSolana()}>REVIEW TRANSACTION</button> : <button className="acid-action" disabled={solanaTransaction.isSending} onClick={() => void sendSolana()}>APPROVE IN WALLET</button>}{simulationUnits !== null && <p className="simulation-proof">SIMULATION PASSED · {simulationUnits.toString()} UNITS</p>}</div>}
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
      <div className="deposit-head"><div><span>POOL ENTRY</span><h3>Deposit an NFT</h3></div><small>TESTNET</small></div>
      <div className="family-tabs"><button className={family === "evm" ? "active" : ""} onClick={() => setFamily("evm")}>EVM</button><button className={family === "solana" ? "active" : ""} onClick={() => setFamily("solana")}>SOLANA</button></div>
      {family === "evm" ? <div className="deposit-form"><div className="field field--wide"><label>Wallet</label><EvmWallet /></div><div className="field"><label htmlFor="network">Chain</label><select id="network" value={chainId ?? 80002} onChange={(event) => switchChain({ chainId: Number(event.target.value) as 80002 | 137 | 1 | 8453 | 42161 })}>{evmChains.map((chain) => <option value={chain.id} key={chain.id}>{chain.name}</option>)}</select></div><div className="field"><label htmlFor="standard">Standard</label><select id="standard" value={standard} onChange={(event) => setStandard(event.target.value as EvmStandard)}><option>ERC-721</option><option>ERC-1155</option></select></div><div className="field field--wide"><label htmlFor="collection">Collection contract</label><input id="collection" placeholder="0x…" value={collection} onChange={(event) => setCollection(event.target.value)} /></div><div className="field"><label htmlFor="token">Token ID</label><input id="token" inputMode="numeric" placeholder="Token ID" value={tokenId} onChange={(event) => setTokenId(event.target.value)} /></div><div className="field"><label htmlFor="amount">Amount</label><input id="amount" inputMode="numeric" disabled={standard === "ERC-721"} value={amount} onChange={(event) => setAmount(event.target.value)} /></div><label className="rights-check field--wide"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /><span><strong>Add media rights</strong>Optional. Rights are reviewed before any listing goes live.</span></label>{!configured && <p className="launch-note field--wide">Preview only—entries and prizes are not active.</p>}<div className="action-row field--wide"><button className="outline-action" disabled={!canDeposit || isPending} onClick={() => void approveAsset()}>{approved ? "APPROVED" : "1 · APPROVE NFT"}</button><button className="acid-action" disabled={!canDeposit || !approved || isPending} onClick={() => void depositAsset()}>{isPending ? "CONFIRM IN WALLET…" : "2 · DEPOSIT NFT"}</button></div>{(notice || receipt.isSuccess) && <p className="notice field--wide">{receipt.isSuccess ? "Your position is confirmed." : notice}</p>}</div> : <div className="solana-panel"><SolanaWallet /><div className="standard-tags"><span>Metadata</span><span>pNFT</span><span>Token-2022</span><span>Core</span></div><p>Choose an NFT, review the transaction, then sign. Media rights stay optional.</p><button className="acid-action" disabled={!solanaProgramId}>{solanaProgramId ? "REVIEW SOLANA ENTRY" : "PROGRAM DEPLOYMENT PENDING"}</button></div>}
    </div>
  );
}

function Marketplace({ onSelect }: { onSelect: (asset: CatalogAsset) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All media" | CatalogCategory>("All media");
  const [chain, setChain] = useState("All chains");
  const [license, setLicense] = useState("All licenses");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = catalogAssets.filter((asset) => {
      const searchable = [asset.name, asset.category, asset.chain, asset.standard, asset.licenseLabel, ...asset.permittedUses].join(" ").toLowerCase();
      return (!normalized || searchable.includes(normalized))
        && (category === "All media" || asset.category === category)
        && (chain === "All chains" || asset.chain === chain)
        && (license === "All licenses" || asset.licenseLabel === license);
    });
    return filtered;
  }, [category, chain, license, query]);

  return (
    <section className="media-marketplace" id="marketplace">
      <div className="marketplace-heading">
        <div><p className="eyebrow">FOR MEDIA BUYERS</p><h2>Find media.<br />License it onchain.</h2></div>
        <p>Browse rights-reviewed media, pay with native crypto, and keep the receipt.</p>
      </div>

      <div className="marketplace-search">
        <label htmlFor="media-search">SEARCH MEDIA</label>
        <div><span aria-hidden="true">⌕</span><input id="media-search" type="search" placeholder="Search by style, use, or chain" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>

      <div className="marketplace-controls">
        <div className="category-filter" aria-label="Media categories">{catalogCategories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="select-filters">
          <label>CHAIN<select value={chain} onChange={(event) => setChain(event.target.value)}><option>All chains</option>{[...new Set(catalogAssets.map((asset) => asset.chain))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>LICENSE<select value={license} onChange={(event) => setLicense(event.target.value)}><option>All licenses</option><option>Commercial</option><option>Extended</option></select></label>
        </div>
      </div>

      <div className="results-heading"><strong>{results.length} PREVIEW LISTINGS</strong><span>Demo inventory</span></div>
      {results.length > 0 ? <div className="media-grid">{results.map((asset) => <article className="media-card" key={asset.slug}>
        <button className="media-card__visual" onClick={() => onSelect(asset)} aria-label={`View ${asset.name}`}><PackVisual asset={asset} /><span className="preview-chip">PREVIEW</span><span className="license-chip">{asset.licenseLabel}</span></button>
        <div className="media-card__body"><div className="media-card__title"><div><strong>{asset.name}</strong><small>{asset.category} · {asset.chain}</small></div><b>{asset.chain === "Solana" ? asset.solanaPriceLabel : asset.nativePriceLabel}<span>{asset.chain === "Solana" ? "SOL" : "NATIVE"}</span></b></div><button className="card-license" onClick={() => onSelect(asset)}>VIEW LICENSE</button></div>
      </article>)}</div> : <div className="empty-results"><strong>No previews match those filters.</strong><button onClick={() => { setQuery(""); setCategory("All media"); setChain("All chains"); setLicense("All licenses"); }}>CLEAR FILTERS</button></div>}
      <p className="catalog-disclaimer">Preview inventory only. Live listings require verified ownership and media rights.</p>
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
      <header className="site-header"><a href="#top" className="brand-link"><Mark /><strong>JPEG POT</strong><span>NFT PRIZE POOL</span></a><nav><a href="#how">How it works</a><a href="#enter">Enter the pool</a><a href="#marketplace">License media</a></nav><a className="header-action" href="#enter">ENTER POOL</a></header>
      <main id="top">
        <section className="hero"><div className="hero-copy"><p className="eyebrow">MULTICHAIN NFT PRIZE POOL</p><h1>Give your NFT <em>another chance.</em></h1><p className="hero-lede">Deposit an idle NFT for prize eligibility. If its media rights are verified, licensing revenue can refill the pool—without selling the NFT.</p><div className="hero-actions"><a href="#enter" className="acid-action">ENTER AN NFT</a><a href="#marketplace" className="outline-action">LICENSE MEDIA</a></div><div className="hero-proof"><span>KEEP OWNERSHIP</span><span>RIGHTS OPTIONAL</span><span>ONCHAIN ONLY</span></div></div><PoolPreview /></section>

        <section className="model" id="how"><div className="section-heading"><p className="eyebrow">HOW IT WORKS</p><h2>Deposit. License. Reward.</h2></div><div className="model-grid"><article><span>01</span><h3>Enter the pool</h3><p>Lock a supported NFT in its chain-local vault.</p></article><article><span>02</span><h3>License the media</h3><p>Verified artwork can be licensed for native crypto.</p></article><article><span>03</span><h3>Fund rewards</h3><p>Revenue can support prizes, member drops, reserves, or $POT buy-and-burn.</p></article></div><p className="model-note"><strong>Media rights are optional.</strong> An NFT can join the pool without being listed for commercial use.</p></section>

        <section className="enter-section" id="enter"><div className="enter-copy"><p className="eyebrow">FOR NFT HOLDERS</p><h2>Enter the pool.</h2><p>Connect a wallet and choose an NFT. Your asset stays in a chain-local vault and can be withdrawn under the published rules.</p><div className="enter-points"><span>Keep beneficial ownership</span><span>Never share wallet secrets</span><span>Opt in to media rights only if you have them</span></div></div><DepositPanel /></section>

        <Marketplace onSelect={selectAsset} />

        <section className="principles"><div className="section-heading"><p className="eyebrow">CLEAR BY DESIGN</p><h2>One pool. Clear boundaries.</h2></div><div className="principle-grid"><article><h3>Chain-local custody</h3><p>NFTs stay on their source chain. No bridge is required.</p></article><article><h3>Explicit rights</h3><p>Ownership alone never becomes a media license.</p></article><article><h3>Public preview</h3><p>No prize draw is active until contracts, policy, audits, and legal review are complete.</p></article></div><div className="network-list" aria-label="Supported network families">{supportedNetworks.map((network) => <span key={network.name}>{network.name}</span>)}</div></section>
      </main>
      <footer><div className="footer-brand"><Mark /><div><strong>JPEG POT</strong><span>Give an NFT another chance.</span></div></div><div><a href="#enter">Enter pool</a><a href="#marketplace">License media</a><a href="/terms/v1">Member terms</a><a href="/license/v1">Buyer terms</a></div><p>TESTNET · NO ACTIVE PRIZE</p></footer>
      {selectedAsset && <LicensePackModal asset={selectedAsset} onClose={closeAsset} />}
    </>
  );
}
