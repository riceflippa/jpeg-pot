import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SolanaProvider } from "@solana/react-hooks";
import { WagmiProvider } from "wagmi";
import App from "./App";
import { wagmiConfig } from "./lib/evm";
import { solanaClient } from "./lib/solana";
import "./styles.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SolanaProvider client={solanaClient}>
          <App />
        </SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
