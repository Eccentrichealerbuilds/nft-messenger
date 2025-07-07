import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import React from 'react';

// 1. Get projectId from https://cloud.walletconnect.com
const projectId = '33c7b9a2cbd0ee02ddfbbaf5a3d81a67'

// 2. Set chains
const monadTestnet = {
  chainId: 10143,
  name: 'Monad Testnet',
  currency: 'MON',
  explorerUrl: 'https://testnet.monadexplorer.com',
  rpcUrl: 'https://testnet-rpc.monad.xyz'
}

// 3. Create modal
const metadata = {
  name: 'NFT Messenger',
  description: 'A decentralized messaging app using NFTs',
  url: 'https://web3modal.com', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
}

createWeb3Modal({
  ethersConfig: defaultConfig({ metadata }),
    chains: [monadTestnet],
  projectId,
  enableAnalytics: true // Optional - defaults to your Cloud configuration
})

export function Web3ModalProvider({ children }: { children: React.ReactNode }) {
  return children;
}
