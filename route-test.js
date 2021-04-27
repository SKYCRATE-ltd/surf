import Server from "uWebSockets.js";

Server.App()
	.any('/*', (res, req) => res.write('Hello, World... ') && req.setYield(true))
	.get('/*', (res, req) => res.write('You found me! ') && req.setYield(true))
	.get('/*', (res, req) => res.write('And yet again. ') && req.setYield(true))
	.any('/*', (res, req) => res.write('So, goodbye, World.  ') && req.setYield(true))
	.any('/*', (res, req) => res.end('Last?'))
.listen(9001, token => {
	console.log(token);
});

const a = () =>
	new Promise(
		res =>
			setTimeout(
				() => res(1),
				1000
			)
	);

const b = async () => console.log(await a());
console.log(a());
console.log(await b());
console.log('Hello');