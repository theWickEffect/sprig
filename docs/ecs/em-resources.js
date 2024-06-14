import { DBG_VERBOSE_ENTITY_PROMISE_CALLSITES, DBG_INIT_CAUSATION, } from "../flags.js";
import { assert, getCallStack } from "../utils/util-no-import.js";
import { _init } from "./ecs.js";
import { componentNameToId, componentsToString } from "./em-components.js";
export function createEMResources() {
    const resourcePromises = [];
    const resourceDefs = new Map();
    const resources = {};
    const seenResources = new Set();
    const _dbgResourcePromiseCallsites = new Map();
    let _nextResourcePromiseId = 1;
    function defineResource(name, construct) {
        const id = componentNameToId(name);
        if (resourceDefs.has(id)) {
            throw `Resource with name ${name} already defined--hash collision?`;
        }
        const def = {
            _brand: "resourceDef", // TODO(@darzu): remove?
            name,
            construct,
            id,
        };
        resourceDefs.set(id, def);
        return def;
    }
    function addResource(def, ...args) {
        assert(resourceDefs.has(def.id), `Resource ${def.name} (id ${def.id}) not found`);
        assert(resourceDefs.get(def.id).name === def.name, `Resource id ${def.id} has name ${resourceDefs.get(def.id).name}, not ${def.name}`);
        assert(!(def.name in resources), `double defining resource ${def.name}!`);
        const c = def.construct(...args);
        resources[def.name] = c;
        seenResources.add(def.id);
        return c;
    }
    // TODO(@darzu): replace most (all?) usage with addResource
    function ensureResource(def, ...args) {
        const alreadyHas = def.name in resources;
        if (!alreadyHas) {
            return addResource(def, ...args);
        }
        else {
            return resources[def.name];
        }
    }
    function removeResource(def) {
        if (def.name in resources) {
            delete resources[def.name];
        }
        else {
            throw `Tried to remove absent resource ${def.name}`;
        }
    }
    // TODO(@darzu): should this be public??
    // TODO(@darzu): rename to findResource
    function getResource(c) {
        return resources[c.name];
    }
    function hasResource(c) {
        return c.name in resources;
    }
    // TODO(@darzu): remove? we should probably be using "whenResources"
    function getResources(rs) {
        if (rs.every((r) => r.name in resources))
            return resources;
        return undefined;
    }
    function whenResources(...rs) {
        // short circuit if we already have the components
        if (rs.every((c) => c.name in resources))
            return Promise.resolve(resources);
        const promiseId = _nextResourcePromiseId++;
        if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES || DBG_INIT_CAUSATION) {
            // if (dbgOnce("getCallStack")) console.dir(getCallStack());
            let line = getCallStack().find((s) => !s.includes("entity-manager") && //
                !s.includes("em-helpers"));
            if (DBG_VERBOSE_ENTITY_PROMISE_CALLSITES)
                console.log(`promise #${promiseId}: ${componentsToString(rs)} from: ${line}`);
            _dbgResourcePromiseCallsites.set(promiseId, line);
        }
        return new Promise((resolve, reject) => {
            const sys = {
                id: promiseId,
                rs,
                callback: resolve,
            };
            resourcePromises.push(sys);
        });
    }
    function dbgResourcePromises() {
        let res = "";
        for (let prom of resourcePromises) {
            // if (prom.rs.some((r) => !(r.name in resources)))
            res += `resources waiting: (${prom.rs.map((r) => r.name).join(",")})\n`;
        }
        return res;
    }
    function progressResourcePromises() {
        let madeProgress = false;
        // TODO(@darzu): extract into resourcePromises munging into EMResources
        // check resource promises
        // TODO(@darzu): also check and call init functions for systems!!
        for (
        // run backwards so we can remove as we go
        let idx = resourcePromises.length - 1; idx >= 0; idx--) {
            const p = resourcePromises[idx];
            let finished = p.rs.every((r) => r.name in resources);
            if (finished) {
                resourcePromises.splice(idx, 1);
                // TODO(@darzu): record time?
                // TODO(@darzu): how to handle async callbacks and their timing?
                p.callback(resources);
                madeProgress = true;
                continue;
            }
            // if it's not ready to run, try to push the required resources along
            p.rs.forEach((r) => {
                const forced = _init.requestResourceInit(r);
                madeProgress ||= forced;
                if (DBG_INIT_CAUSATION && forced) {
                    const line = _dbgResourcePromiseCallsites.get(p.id);
                    console.log(`${performance.now().toFixed(0)}ms: '${r.name}' force by promise #${p.id} from: ${line}`);
                }
            });
        }
        return madeProgress;
    }
    const result = {
        resources,
        seenResources,
        defineResource,
        addResource,
        ensureResource,
        removeResource,
        getResource,
        hasResource,
        getResources,
        whenResources,
        progressResourcePromises,
    };
    return result;
}
//# sourceMappingURL=em-resources.js.map