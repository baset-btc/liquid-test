import * as coinSelectService from 'coinselect';
import * as liquidService from 'liquidjs-lib';
import * as liquidPsbtService from 'liquidjs-lib/src/psbt';
import { ECPairFactory } from 'ecpair';
import * as eccService from 'tiny-secp256k1';

import axios from 'axios';

const eCPairService = ECPairFactory(eccService);

const utxos = []; // Used Utxos
const feeRate = 0.1;
const network = liquidService.networks.testnet;
const lbtcAsset = network.assetHash;
const nonce = Buffer.from('00', 'hex');
const formattedLBtcAsset = Buffer.concat([
  Buffer.from('01', 'hex'),
  Buffer.from(lbtcAsset, 'hex').reverse(),
]);
const keyPair = eCPairService.fromPrivateKey(
  Buffer.from('acbc28e59c0122f97d479d1e22806534f5bc4ff0bf127505be7dd8a8e11dc726', 'hex'),
  network,
);
const destination = 'tex1qjs04qhw2qnf2jacduc4eg3gc2fspysrtevzrvy';
const source = 'tex1qdk63j2aeau4chg35mrjmjwvaggv5r8u44066sm';

const targets = [
  {
    address: destination,
    value: Math.round(0),
  },
];

const {
  inputs: inputsSelected,
  outputs: outputsSelected, // TODO: Add height to compensate the creation of asset
  // If create BTA, it adds an output 398 vB
  // TODO: Evaluate transaction fees
} = coinSelectService(utxos, targets, feeRate);

outputsSelected.shift();

const establishedFee = 34;
const differenceToDiscount = 0;

const psbt = new liquidPsbtService.Psbt();

const inputs = inputsSelected.map(({ txId, vout, witnessUtxo: { value, asset } }) => ({
  hash: txId,
  index: vout,
  witnessUtxo: {
    nonce,
    asset: Buffer.from(asset),
    value: liquidService.ElementsValue.fromNumber(value).bytes,
    script: liquidService.address.toOutputScript(source, network),
  },
}));

psbt.addInputs(inputs);

const outputs = outputsSelected.map(({ value, address }) => ({
  nonce,
  asset: formattedLBtcAsset,
  value: liquidService.ElementsValue.fromNumber(address ? value : value - differenceToDiscount)
    .bytes,
  script: liquidService.address.toOutputScript(address ?? source, network),
}));

outputs.push({
  nonce,
  asset: formattedLBtcAsset,
  value: liquidService.ElementsValue.fromNumber(establishedFee).bytes,
  script: Buffer.alloc(0),
});

psbt.addOutputs(outputs);

const contract = {
  entity: {
    domain: 'baset.io',
  },
  issuer_pubkey: keyPair.publicKey.toString('hex'),
  name: 'casas',
  precision: 0,
  ticker: 'casas',
  version: 0,
};

psbt.addIssuance({
  assetSats: 1,
  tokenSats: 0,
  assetAddress: destination,
  blindedIssuance: false,
  contract,
});

psbt.signAllInputs(keyPair);

const valid = psbt.validateSignaturesOfAllInputs(
  liquidPsbtService.Psbt.ECDSASigValidator(eccService),
);

if (!valid) {
  throw Error('Invalid trx on BTA liquid creation');
}

psbt.finalizeAllInputs();

const txHex = psbt.extractTransaction().toHex();

// TODO: Broadcast transaction to liquid network and get assetId

// Registry asset //

const apiUrl = 'https://assets-testnet.blockstream.info';
const assetId = 'a9d52b02348a097d4f780644064c437e364a41d6299290fef1c49e7d1fbbf665';

axios
  .post(apiUrl, {
    asset_id: assetId,
    contract,
  })
  .then(response => {
    console.log('Respuesta de la solicitud:', response.data);
  })
  .catch(error => {
    console.log('Error en la solicitud:', error);
  });
