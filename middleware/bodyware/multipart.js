import { DECODE } from "../src/utils.js";

export default {
	parse: [
		req => req.type.startsWith('multipart/form-data'),
		(body, req) => {
			return Object.fromEntries(new Map(
				// Rejig request to have getParts as a built-in method...
				this.#app.getParts(body, req.type)
					.map(({ type, name, filename, data }) => {
						return [
							name,
							type ?
								{ type, filename, data } :
									DECODE(data)  // String()?
						];
					})
			));
		}
	]
}