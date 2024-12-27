import Application from "./application";
void (async () => {
	const application = new Application();
	await application.connect();
	await application.init();
})();
