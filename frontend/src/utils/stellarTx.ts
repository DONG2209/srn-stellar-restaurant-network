/**
 * Utility to submit real Stellar testnet transactions via Freighter.
 */

import {
  SorobanRpc,
  TransactionBuilder,
  Transaction,
  Networks,
  BASE_FEE,
  Operation,
  Asset,
  Memo,
} from '@stellar/stellar-sdk';
import { signTransaction as freighterSignTx } from '@stellar/freighter-api';

const RPC_URL = 'https://soroban-testnet.stellar.org';

async function ensureFunded(publicKey: string): Promise<void> {
  const rpc = new SorobanRpc.Server(RPC_URL);
  try {
    await rpc.getAccount(publicKey);
    console.log('[Tx] Account found');
    return;
  } catch {
    console.log('[Tx] Funding via Friendbot...');
  }
  const resp = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
  );
  const data = await resp.json();
  if (!data.successful) {
    throw new Error('Friendbot failed. Fund at https://laboratory.stellar.org');
  }
  await new Promise((r) => setTimeout(r, 3000));
}

export async function submitDemoTransaction(
  sourcePublicKey: string
): Promise<{ hash: string; explorerUrl: string }> {
  console.log('[Tx] Step 1: ensure funded');
  await ensureFunded(sourcePublicKey);

  console.log('[Tx] Step 2: getAccount');
  const rpc = new SorobanRpc.Server(RPC_URL);
  const account = await rpc.getAccount(sourcePublicKey);

  console.log('[Tx] Step 3: build transaction');
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: sourcePublicKey,
        asset: Asset.native(),
        amount: '0.00001',
      })
    )
    .addMemo(Memo.text('Restaurant dApp demo'))
    .setTimeout(30)
    .build();

  console.log('[Tx] Step 4: serialize to XDR');
  const envelope = tx.toEnvelope();
  const xdrBytes = envelope.toXDR();
  // Convert bytes to base64 (browser-safe, no Node Buffer needed)
  let binary = '';
  const bytes = new Uint8Array(xdrBytes);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const txXdr = btoa(binary);
  console.log('[Tx] XDR length:', txXdr.length);

  console.log('[Tx] Step 5: sign with Freighter');
  const signResult = await freighterSignTx(txXdr, {
    networkPassphrase: Networks.TESTNET,
  });

  if (signResult.error) {
    throw new Error(`Sign error: ${signResult.error}`);
  }
  if (!signResult.signedTxXdr) {
    throw new Error('No signed XDR returned');
  }
  console.log('[Tx] Step 6: submit signed transaction');
  // sendTransaction expects a Transaction object, not raw XDR
  // Parse the signed XDR back into a Transaction for submission
  const signedTx = new Transaction(signResult.signedTxXdr, Networks.TESTNET);
  const submitResult = await rpc.sendTransaction(signedTx);

  if (submitResult.status === 'PENDING' && submitResult.hash) {
    console.log('[Tx] SUCCESS:', submitResult.hash);
    return {
      hash: submitResult.hash,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${submitResult.hash}`,
    };
  }

  throw new Error(`Submit failed: ${submitResult.status}`);
}
