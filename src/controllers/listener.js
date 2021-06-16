import { UInt, Type } from "zed";
import { DISABLED } from "uWebSockets.js";
import Peers from "../models/peers.js";

export class Listener extends Type({
	compression: UInt,
	maxPayloadLength: UInt,
	maxBackpressure: UInt,
	idleTimeout: class MultipleOf4 extends UInt {
		static defines(instance) {
			return instance instanceof Number && instance % 4 === 0;
		}
	},

	open: Function,
	message: Function,
	close: Function,
	drain: Function
}) {
	#peers = new Peers();
	static SOCKETS_IN_USE = 0;

	constructor(mountpoint, hooks, middleware) {
		if (is.function(hooks))
			hooks = {
				message: hooks
			};
		super({
			compression: hooks.compression ?? DISABLED,
			maxPayloadLength: hooks.payload ?? 16 * 1024,
			maxBackpressure: hooks.pressure ?? 1024,
			idleTimeout: hooks.timeout ?? 0,

			open: socket => {
				socket = this.#peers.add(socket, mountpoint, middleware);
				console.log(`\r 📭 SOCKET #${socket.id} OPEN                            `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  PEERS: ${this.#peers.length}`);
				console.log('------------------------------------------------------------');

				Listener.SOCKETS_IN_USE++;
				hooks.open?.(socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			message: (socket, message, is_binary) => {
				socket = this.#peers.get(socket);
				console.log(`\r 📬 SOCKET #${socket.id} RECEIVED MESSAGE                `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  BINARY: ${is_binary}`);

				if (message !== HANDLED && message !== YIELD) {
					message = is_binary ?
						middleware.read(message, socket) :
							middleware.parse(DECODE(message), socket);

					console.log({...message});
					console.log('------------------------------------------------------------');

					const rtrn = hooks.message(
						message,
						socket,
						this.#peers
					);
					if (rtrn && rtrn !== HANDLED && rtrn !== YIELD)
						socket.send(rtrn);
				}

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			close: (socket, code, reason) => {
				socket = this.#peers.remove(socket);
				reason = DECODE(reason);
				console.log(`\r 📪 SOCKET #${socket.id} CLOSED                          `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  REASON: ${code} ${reason}`);
				console.log(`  PEERS: ${this.#peers.length}`);
				console.log('------------------------------------------------------------');

				Listener.SOCKETS_IN_USE--;
				hooks.close?.(code, reason, socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			drain: socket => {
				socket = this.#peers.get(socket);
				console.log(`\r 📫 SOCKET #${socket.id} DRAIN                           `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  BACK PRESSURE: ${socket.backpressure}`);
				console.log('------------------------------------------------------------');

				hooks.drain?.(socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
		});
	}
}