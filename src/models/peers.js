import { HANDLED } from "../constants.js";

export class Peers extends Array {
	constructor(...args) {
		super(...args);
	}

	send(msg, compress = false) {
		this.forEach(socket => socket.send(msg, compress));
		return HANDLED;
	}

	get(socket) {
		return this.find(s => s.wraps(socket))?.reset();
	}

	add(socket, mountpoint, middleware) {
		const s = new Socket(mountpoint, socket, middleware);
		s.id = this.push(s);
		return s;
	}

	remove(socket) {
		const i = this.findIndex(s => s.wraps(socket));
		return this.splice(i, 1)[0]?.reset();
	}
}