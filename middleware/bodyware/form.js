export default {
	parse: [
		req => req.type === 'application/x-www-form-urlencoded',
		body => QUERY(new String(body || ''))
	]
}
