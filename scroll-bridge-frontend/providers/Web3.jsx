import { useEffect, useState } from "react"
import "@rainbow-me/rainbowkit/styles.css"
import { configureChains, createConfig, WagmiConfig } from "wagmi"
import { getDefaultWallets, RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit"
import {
  arbitrum,
  goerli,
  mainnet,
  optimism,
  polygon,
  zora,
  zkSyncTestnet,
  sepolia
} from "wagmi/chains"
import { publicProvider } from "wagmi/providers/public"

export const ScrollSepoliaTestnet = {
  id: 534351,
  name: 'Scroll Sepolia Testnet',
  network: 'Scroll Sepolia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    public: { http: ['https://scroll-sepolia.blockpi.network/v1/rpc/public'] },
    default: { http: ['https://scroll-sepolia.blockpi.network/v1/rpc/public'] },
  },
  blockExplorers: {
    default: { name: 'scrollscan', url: 'https://sepolia.scrollscan.dev' },
  }
}

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [
    // mainnet,
    // polygon,
    // optimism,
    // arbitrum,
    // zora,
    // ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? [goerli] : [])
    ScrollSepoliaTestnet,
    sepolia
  ],
  [publicProvider()]
)

const { connectors } = getDefaultWallets({
  appName: "Dapp Forge",
  projectId: "928c0944dc8279fb073a7405ecd6b657",
  chains
})

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient
})

export function Web3Provider(props) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  return (
    <>
      {ready && (
        <WagmiConfig config={wagmiConfig}>
          <RainbowKitProvider chains={chains} theme={lightTheme({
            accentColor: "#f4be76",
            accentColorForeground: "white",
            borderRadius: "medium"
          })}>
            {props.children}
          </RainbowKitProvider>
        </WagmiConfig>
      )}
    </>
  )
}
