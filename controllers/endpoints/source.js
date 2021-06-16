import { Endpoint } from "../../index.js";

// We need to dwell on this a tad...
export class Source extends Endpoint {
	#peers = [];

	constructor(authware, validator) {
		super({
			get(req, res) {
				this.#peers.push(res);
				res.onabort(() => {
					this.#peers = this.#peers.filter(peer => peer !== res);
				});
			},
			async post(req, res) {
				const body = await req.body();
				// Aye! We wanna use form or something...
			}
		});
		this.authware(authware);
	}

	emit(channel, data) {
		if (!data) {
			data = channel;
			channel = 'message';
		}
		data = data instanceof String ? data : JSON.stringify(data);
		this.#peers.forEach(peer => peer.emit(channel, data));
		return this;
	}
}