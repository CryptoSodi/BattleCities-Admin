// The admin is a standalone website, not the Capacitor game. It needs only
// wallet connection + message signing, never transaction or private-key access.
interface WalletProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: string): Promise<Uint8Array | { signature: Uint8Array }>;
}

export function getPhantomProvider(): WalletProvider | null {
  const walletWindow = window as Window & {
    phantom?: { solana?: WalletProvider };
    solana?: WalletProvider;
  };
  const provider = walletWindow.phantom?.solana || walletWindow.solana;
  return provider?.isPhantom === true ? provider : null;
}
