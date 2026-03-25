import type { Configuration } from "electron-builder";
import base from "./electron-builder";

const baseMac = base.mac ?? {};
const baseProtocols = Array.isArray(base.protocols)
	? base.protocols
	: base.protocols
		? [base.protocols]
		: [];

const config: Configuration = {
	...base,
	appId: "com.superset.desktop.internal",
	productName: "Superset Internal",
	publish: null,
	mac: {
		...baseMac,
		hardenedRuntime: false,
		gatekeeperAssess: false,
		notarize: false,
	},
	protocols: baseProtocols.map((protocol) => ({
		...protocol,
		name: "Superset Internal",
		schemes: ["superset-internal"],
	})),
};

export default config;
