import { createEMEntities } from "./em-entities.js";
import { createEMComponents } from "./em-components.js";
import { createEMInit } from "./em-init.js";
import { createEMResources } from "./em-resources.js";
import { createEMSystems } from "./em-systems.js";
function createEMMeta() {
    const emStats = {
        queryTime: 0,
        dbgLoops: 0,
    };
    function update() {
        // TODO(@darzu): can EM.update() be a system?
        let madeProgress;
        do {
            madeProgress = false;
            madeProgress ||= _init.progressInitFns();
            madeProgress ||= _resources.progressResourcePromises();
            madeProgress ||= _entities.progressEntityPromises();
        } while (madeProgress);
        _systems.callSystems();
        _meta.emStats.dbgLoops++;
    }
    const res = {
        emStats,
        update,
    };
    return res;
}
export const _meta = createEMMeta();
export const _entities = createEMEntities();
export const _components = createEMComponents();
export const _systems = createEMSystems();
export const _resources = createEMResources();
export const _init = createEMInit();
function createEmporiumECS() {
    return {
        ..._meta,
        ..._entities,
        ..._components,
        ..._systems,
        ..._resources,
        ..._init,
    };
}
export const EM = createEmporiumECS();
//# sourceMappingURL=ecs.js.map