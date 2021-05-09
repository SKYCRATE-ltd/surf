import { STATUS } from "../constants.js";

export default {
	parse: [
		req => req.type === 'application/json',
		(body, req) => {
			try {
				return JSON.parse(body);
			} catch(e) {
				return req.bad_request(`${STATUS.BadRequest} MALFORMED JSON`);
			}
		}
	],
	stringify: [
		req => req.accepted.includes('application/json'), // this should be response.type?
		(body, req, res) => {
			res.type = 'application/json';
			return JSON.stringify(body) ?? '';
		}
	],
}
