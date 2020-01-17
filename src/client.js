const BSVABI = require('@twetch/bsvabi');
const axios = require('axios');
const datapay = require('datapay');

const Storage = require('./storage');
const Wallet = require('./wallet');

class Client {
	constructor(options = {}) {
		this.network = options.network || 'mainnet';
		this.wallet = new Wallet(options);
		this.client = axios.create({ baseURL: options.apiUrl || 'https://dev-api.twetch.app/v1' });
		this.initAbi();
	}

	async initAbi() {
		this.abi = JSON.parse(Storage.getItem('abi') || '{}');
		this.abi = await this.fetchABI();
		Storage.setItem('abi', JSON.stringify(this.abi));
	}

	async buildTx(data, payees = []) {
		const to = payees.map(e => ({
			address: e.to,
			value: parseInt((e.amount * 100000000).toFixed(0), 10)
		}));

		return new Promise((resolve, reject) => {
			datapay.build({ data, pay: { rpc: 'https://api.bitindex.network/api/v3/test', key: this.wallet.privateKey.toString(), to } }, (err, tx) => {
				if (err) {
					return reject(err);
				}
				return resolve(tx);
			});
		});
	}

	async buildAndPublish(action, payload) {
		if (!this.abi || !this.abi.name) {
			await this.initAbi();
		}
		const abi = new BSVABI(this.abi, {
			network: this.network,
			sign: value => this.wallet.sign(value),
			address: () => this.wallet.address.toString(),
			invoice: () => this.invoice
		})
			.action(action)
			.fromObject(payload);
		const payeeResponse = await this.fetchPayees({ args: abi.toArray(), action });
		this.invoice = payeeResponse.invoice;
		await abi.replace();
		const tx = await this.buildTx(abi.toArray(), payeeResponse.payees);
		const response = await this.publish({
			signed_raw_tx: tx.toString(),
			invoice: payeeResponse.invoice
		});
		return response;
	}

	async fetchABI() {
		const response = await this.client.get('/abi');
		return response.data;
	}

	async fetchPayees(payload) {
		const response = await this.client.post('/payees', payload);
		return response.data;
	}

	async publish(payload) {
		const response = await this.client.post('/publish', payload);
		return response.data;
	}
}

module.exports = Client;