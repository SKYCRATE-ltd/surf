import { Type } from "zed";
import { DECODE, HANDLED } from "../constants.js";

export class Socket extends Type {
	#ip;
	#id;
	#timestamp;
	#socket;
	#mountpoint;
	#middleware;

	get ip() {
		return this.#ip ?? (this.#ip = DECODE(
			this.#socket.getRemoteAddressAsText()
		).replace(/0000/g, ''));
	}

	get id() {
		return this.#id || this.ip;
	}

	set id(id) {
		return this.#id = id;
	}

	get time() {
		return Date.now() - this.#timestamp; // ms
	}

	get backpressure() {
		return this.#socket.getBufferedAmount();
	}

	constructor(mountpoint, socket, middleware) {
		super();
		this.#mountpoint = mountpoint;
		this.#socket = socket;
		this.#middleware = middleware;
		this.reset();
	}

	cork(callback) {
		this.#socket.cork(callback);
		return HANDLED;
	}

	pipe(msg) {
		const is_binary = msg instanceof Binary;
		console.log(`\r 📨 SOCKET OUTBOUND MESSAGE`);
		console.log('------------------------------------------------------------');
		console.log(`  ROUTE: ${this.#mountpoint}`);
		console.log(`  BINARY: ${is_binary}`);
		console.log({...msg});

		msg = is_binary ?
			this.#middleware.write(msg, this) :
				this.#middleware.stringify(msg, this);
		console.log('------------------------------------------------------------');
		
		return [
			msg,
			is_binary
		];
	}

	send(msg, compress = false) {
		this.#socket.send(...this.pipe(msg), compress);
		return HANDLED;
	}

	publish(topic, msg, compress = false) {
		this.#socket.publish(topic, ...this.pipe(msg), compress);
		return HANDLED;
	}

	subscribe(topic) {
		this.#socket.subscribe(topic);
		return this;
	}

	unsubscribe(topic) {
		this.#socket.unsubscribe(topic);
		return this;
	}

	end(code, msg) {
		this.#socket.end(code, String(msg));
		return HANDLED;
	}

	close() {
		this.#socket.close();
		return HANDLED;
	}

	wraps(socket) {
		return this.#socket === socket;
	}

	reset() {
		this.#timestamp = Date.now();
		return this;
	}
}