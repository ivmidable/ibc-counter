import { CosmWasmSigner, Link, testutils, Logger } from "@confio/relayer";
import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";


import assert, { doesNotMatch } from "assert";

import {
    IbcVersion,
    setupContracts,
    setupOsmosisClient,
    setupOsmosisQueryClient,
    setupWasmClient,
    setupWasmQueryClient,
} from "./utils";

const { osmosis: oldOsmo, setup, wasmd } = testutils;
const osmosis = { ...oldOsmo, minFee: "0.025uosmo" };

let wasmIds: Record<string, number> = {};
let osmosisIds: Record<string, number> = {};

interface SetupInfo {
    wasmClient: CosmWasmSigner;
    osmoClient: CosmWasmSigner;
    wasmCounter: string;
    osmoCounter: string;
    link: Link;
    channelIds: {
        wasm: string;
        osmo: string;
    };
};

const logger: Logger = {
    debug(message: string, meta?: Record<string, unknown>): Logger {
      const logMsg = meta ? message + ": " + JSON.stringify(meta) : message;
      console.debug("[relayer|debug]: " + logMsg);
      return this;
    },

    info(message: string, meta?: Record<string, unknown>): Logger {
      const logMsg = meta ? message + ": " + JSON.stringify(meta) : message;
      console.info("[relayer|info]: " + logMsg);
      return this;
    },

    error(message: string, meta?: Record<string, unknown>): Logger {
      const logMsg = meta ? message + ": " + JSON.stringify(meta) : message;
      console.error("[relayer|error]: " + logMsg);
      return this;
    },

    warn(message: string, meta?: Record<string, unknown>): Logger {
      const logMsg = meta ? message + ": " + JSON.stringify(meta) : message;
      console.warn("[relayer|warn]: " + logMsg);
      return this;
    },

    verbose(message: string, meta?: Record<string, unknown>): Logger {
      const logMsg = meta ? message + ": " + JSON.stringify(meta) : message;
      console.debug("[relayer|verbose]: " + logMsg);
      return this;
    },
  };

async function demoSetup(): Promise<SetupInfo> {
    // instantiate swap on wasmd
    const wasmClient = await setupWasmClient();
    const { contractAddress: wasmCounter } = await wasmClient.sign.instantiate(
        wasmClient.senderAddress,
        wasmIds.counter,
        { count:0 },
        "IBC Counter contract",
        "auto"
    );
    const { ibcPortId: wasmCounterPort } = await wasmClient.sign.getContract(
        wasmCounter
    );
    assert(wasmCounterPort);

    // instantiate swap on osmosis
    const osmoClient = await setupOsmosisClient();
    const { contractAddress: osmoCounter } = await osmoClient.sign.instantiate(
        osmoClient.senderAddress,
        osmosisIds.counter,
        { count:0 },
        "IBC Counter contract",
        "auto"
    );
    const { ibcPortId: osmoCounterPort } = await osmoClient.sign.getContract(
        osmoCounter
    );
    assert(osmoCounterPort);

    // create a connection and channel for simple-ica
    const [src, dest] = await setup(wasmd, osmosis);
    const link = await Link.createWithNewConnections(src, dest);
    const channelInfo = await link.createChannel(
        "A",
        wasmCounterPort,
        osmoCounterPort,
        Order.ORDER_UNORDERED,
        IbcVersion
    );
    const channelIds = {
        wasm: channelInfo.src.channelId,
        osmo: channelInfo.src.channelId,
    };

    console.log(channelInfo);

    return {
        wasmClient,
        osmoClient,
        wasmCounter,
        osmoCounter,
        link,
        channelIds,
    };
}

before(async () => {
    console.debug("Upload contracts to wasmd...");
    const wasmContracts = {
        counter: "../artifacts/ibc_counter.wasm"
    };
    const wasmSign = await setupWasmClient();
    wasmIds = await setupContracts(wasmSign, wasmContracts);

    console.debug("Upload contracts to osmosis...");
    const osmosisContracts = {
        counter: "../artifacts/ibc_counter.wasm",
    };
    const osmosisSign = await setupOsmosisClient();
    osmosisIds = await setupContracts(osmosisSign, osmosisContracts);
});


describe("ibc-counter Test", () => {
    it("works", async () => {
        const {
            osmoClient,
            wasmClient,
            wasmCounter,
            osmoCounter,
            link,
            channelIds,
        } = await demoSetup();

        const wasmIncrement = await wasmClient.sign.execute(
            wasmClient.senderAddress,
            wasmCounter,
            {
                increment: {},
            },
            "auto",
        );
        console.log(wasmIncrement);

        const info = await link.relayAll();
        console.log(info);
        console.log(fromUtf8(info.acksFromB[0].acknowledgement));

        const osmoIncrement = await osmoClient.sign.execute(
            osmoClient.senderAddress,
            osmoCounter,
            {
                increment: {},
            },
            "auto",
        );

        console.log(osmoIncrement);

        const accept_info = await link.relayAll();
        console.log(accept_info);
        console.log(fromUtf8(accept_info.acksFromA[0].acknowledgement));

        let wasmQuery = await wasmClient.sign.queryContractSmart(wasmCounter, { get_count: {} });
        console.log(wasmQuery);
        let osmoQuery = await osmoClient.sign.queryContractSmart(osmoCounter, { get_count: {} });
        console.log(osmoQuery);

        const osmoReset = await osmoClient.sign.execute(
            osmoClient.senderAddress,
            osmoCounter,
            {
                reset: {count:20},
            },
            "auto",
        );

        await link.relayAll();

        let wasmQuery2 = await wasmClient.sign.queryContractSmart(wasmCounter, { get_count: {} });
        console.log(wasmQuery2);
        let osmoQuery2 = await osmoClient.sign.queryContractSmart(osmoCounter, { get_count: {} });
        console.log(osmoQuery2);
    });
});