import { CODES } from "../src/constants.js";

export default {
	parse(string, socket) {
		try {
			return JSON.parse(string);
		} catch(e) {
			return socket.end(
				CODES.UnsupportedData,
				'Expected JSON. You sent garbage, bro.'
			);
		}
	},
	stringify(value) {
		return JSON.stringify(value);
	}
}