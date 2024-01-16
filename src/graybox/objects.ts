import { ColorDef } from "../color/color-ecs.js";
import { ENDESGA16 } from "../color/palettes.js";
import { ComponentDef, EM, Entity, EntityW } from "../ecs/entity-manager.js";
import { V, quat, vec3 } from "../matrix/sprig-matrix.js";
import { CubeMesh } from "../meshes/mesh-list.js";
import {
  PositionDef,
  ScaleDef,
  RotationDef,
  PhysicsParentDef,
} from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { Intersect } from "../utils/util.js";

/*
OBJECTS
goals:
  hierarchy of entities w/ nice bi pointer syntax
  declarative components instead of imperative code

an object has:
  [x] a set of components
  [x] and any number of nested objects
  [ ] optionally those are physics parented
  [x] optionally custom component (w/ properties or just tag)
  [ ] optional constructor w/ build resources
  [ ] optionally entity-pool'ed
    [ ] "just" add onSpawn/onDespawn ?
  [ ] optionally works w/ multiplayer and netEntityHelper etc.
    note: defineNetEntityHelper has local vs props component distinction

  e.g.
    ship
      { cuttingEnable: true }
      mast
        sail
      rudder
      cannonL
      cannonR
*/
// TODO(@darzu): MULTIPLAYER: this uses non-updatable component
// TODO(@darzu): POOLS: this doesn't work with entity pools
//    To work with pools we just need onSpawn, onDespawn
// TODO(@darzu): NAMESPACES? each object and in-line child defines a new component so
//    the component namespaces could become quite cluttered?
// TODO(@darzu): SYSTEMS: how do objects interact w/ systems? Can you match against
//  an object instead of (or in addition to?) a set of components?
// TODO(@darzu): NON-OBJ interop: children needs to accept entities instead of objects and built objects instead of obj def
// TODO(@darzu): self-props is optional? just creates an EntityW<> in that case?

// TODO(@darzu): ARRAY OF CHILDREN?
//    instead of children needing names and a custom component, just use indexes which can
//    be strongly typed

// TODO(@darzu): OBJ.CHILD.XYZ: Maybe instead of all of this, which is mostly to facilitate the parent->children relationship
//    we just have some .child convenient way of tracking parent child relationships

// TODO(@darzu): PHYSICS PARENT: parameters for enabling/disabling physics parenting

/*
Object is:
  set of components
  + (optional) named tag component
  + (optional) named tag component w/ props
  + (optional) .child relation(s)
*/

// TODO(@darzu): .CHILD isn't child?
//    maybe bidirectional
//    .other, .relation, .child
//    could be optional
//    Also, could be we just add relations via setParentChild(entA, entB) then
//    that automatically adds a entA.child ? Hmm hard to do that correctly w/ types

// TODO(@darzu): merge ObjDef and ObjChildDef so that the more permissive one is top-level

/*
Entities vs objects
  entities have components
  objects have components and relations
  objects are entities
  object definitions can have inline component definitions (props)
  OR
  entities have components
  objects have a list of (component | relation)

(can all be seperate:)
how things are defined
  series of attributes (component, props/tag, child relations, physics properties, net-entity stuff)
  can attributes depend on one another? sure
how things are created
  constructor system, immediate construct, components for network, dynamic/full sync stuff,
how things are stored
  ECS, +? anything else permitted?
how things are queried
  ECS queries, +?

We'd love to incorperate delayed construction somehow so we can have things like:
  RenderableConstructDef,
  collider using MeshDef not needing AABB right away
  Authority not needing MeDef
  massively reduce use of async on creation

Merging objects?
  Like constructNetTurret, mixin onto entity
*/

type ObjChildDef = _ObjDef | readonly ComponentDef[];
type ObjChildOpt = ObjOpt | ObjChildDef;

type CType = undefined | Record<string, ObjChildOpt>;

// defines an "object" which is an entity w/ a set of components
//   and children objects
export interface ObjOpt<
  N extends string = string,
  CS extends readonly ComponentDef[] = any[],
  C extends CType = {},
  P extends object = any
  // CArgs extends any[] = any,
  // UArgs extends any[] = any
> {
  // TODO(@darzu): make name optional?
  name: N;
  components: readonly [...CS];
  // TODO(@darzu): dang TS doesn't let you partially pass type parameters.
  //   So defineObject<MyPropsType>() doesn't work.
  //   And I can't seem to make it work using:
  //      dataType: (d: D) => void;
  //    plus helper function: "function T<N>() {}"
  //  actually using "D extends {} = any" works, but T doesn't.
  // TODO(@darzu): HACK. this is a function b/c that lets us annotate a type in
  //  a data structure. Otherwise there's no good way to pass a type parameter.
  propsType?: (p: P) => void;
  // props?: () => P;
  // updateProps?: (p: P, ...args: UArgs) => P;
  children?: C;
  physicsParentChildren?: boolean;
}

interface _ObjDef<D extends ObjOpt = ObjOpt> {
  opts: D;
  props: ObjComponentDef<D>;
  children: Record<string, ObjChildDef>;
}

export type ObjDef<D extends ObjOpt = ObjOpt> = _ObjDef<D> & {
  new: <A extends ObjChildArg<_ObjDef<D>>>(a: A) => ObjChildEnt<_ObjDef<D>>;
  mixin: <A extends ObjChildArg<_ObjDef<D>>>(
    e: Entity,
    a: A
  ) => asserts e is ObjChildEnt<_ObjDef<D>>;
  // TODO(@darzu): IMPL .curry()
};

function isCompDefs(d: ObjChildOpt): d is readonly ComponentDef[] {
  return Array.isArray(d);
}

function isObjDef(d: _ObjDef | ObjOpt): d is _ObjDef {
  return "opts" in d;
}

// helper to grab opts from def or opts
type ObjPickOpt<D extends _ObjDef | ObjOpt> = D extends _ObjDef ? D["opts"] : D;

export type ObjOwnProps<D extends _ObjDef | ObjOpt> =
  ObjPickOpt<D> extends ObjOpt<any, any, any, infer P> ? P : never;

// the component def the tracks the children and custom data of the object
type ObjComponentP<C extends CType, P extends Object> = C extends Record<
  string,
  ObjChildOpt
>
  ? { [n in keyof C]: ObjChildEnt<C[n]> } & P
  : P;
type ObjComponentDef<D extends ObjOpt> = D extends ObjOpt<
  infer N,
  any,
  infer C,
  infer P
>
  ? ComponentDef<N, ObjComponentP<C, P>, [ObjArgs<D>], []>
  : never;

// the entity and all components of an object
export type ObjEnt<D extends ObjOpt | _ObjDef = ObjOpt | _ObjDef> =
  ObjPickOpt<D> extends ObjOpt<any, infer CS>
    ? EntityW<[ObjComponentDef<ObjPickOpt<D>>, ...CS]>
    : never;

type ObjChildEnt<CO extends ObjChildOpt = ObjChildOpt> = CO extends
  | ObjOpt
  | _ObjDef
  ? ObjEnt<CO>
  : CO extends readonly ComponentDef[]
  ? EntityW<[...CO]>
  : never;

// TODO(@darzu): Sorta yikes. Very cool but maybe too clever for its own good
// prettier-ignore
type AsSingle<AS extends any[], BS extends any[]> = 
  [AS, BS] extends [{ length: 0 }, { length: 0 }] ? undefined
: [AS, BS] extends [{ length: 0 }, { length: 1 }] ? BS[0]
: [AS, BS] extends [{ length: 1 }, { length: 0 }] ? AS[0]
: [AS, BS] extends [{ length: 0 }, { length: 0 | 1 }] ? BS[0] | undefined
: [AS, BS] extends [{ length: 0 | 1 }, { length: 0 }] ? AS[0] | undefined
: never;

// the arguments needed to construct an object
type _CompArgs<C extends ComponentDef> = C extends ComponentDef<
  any,
  any,
  infer CArgs,
  infer UArgs,
  infer MA
>
  ? MA extends false
    ? AsSingle<CArgs, UArgs>
    : [...CArgs, ...UArgs]
  : never;
type _CompName<C extends ComponentDef> = C extends ComponentDef<infer N>
  ? N
  : never;

type _ObjCSArgs<D extends ObjOpt> = D extends ObjOpt<any, infer CS>
  ? Intersect<{
      [i in keyof CS]: { [N in _CompName<CS[i]>]: _CompArgs<CS[i]> };
    }>
  : undefined;

type _CompArrayArgs<CS extends readonly ComponentDef[]> = {
  [i in keyof CS]: _CompArgs<CS[i]>;
};

// TODO(@darzu): for child component args to pass undefined for optional args
type _ObjChildArg<CO extends ObjChildOpt = ObjChildOpt> = CO extends
  | ObjOpt
  | _ObjDef
  ? ObjArgs<ObjPickOpt<CO>>
  : CO extends readonly ComponentDef[]
  ? _CompArrayArgs<CO>
  : never;
type ObjChildArg<CO extends ObjChildOpt = ObjChildOpt> =
  | _ObjChildArg<CO>
  | ObjChildEnt<CO>;

function isObjChildEnt(ca: _ObjChildArg | ObjChildEnt): ca is ObjChildEnt {
  return "id" in ca;
}

export type ObjArgs<D extends ObjOpt = ObjOpt> = D extends ObjOpt<
  any,
  infer CS,
  infer C,
  infer P
>
  ? {
      args: _ObjCSArgs<D> | _CompArrayArgs<CS>;
    } & (C extends Record<any, any>
      ? {
          children: C extends Record<any, ObjChildOpt>
            ? {
                [n in keyof C]: ObjChildArg<C[n]>;
              }
            : undefined;
        }
      : { children?: undefined }) &
      ({} extends P
        ? {
            props?: undefined;
          }
        : {
            props: P;
          })
  : never;

// TODO(@darzu): optionally just takes a list of components?
export function defineObj<
  N extends string,
  CS extends readonly ComponentDef[],
  C extends CType,
  P extends object
  // O extends ObjDefOpts<N, CS, C, P> = ObjDefOpts<N, CS, C, P>
  // CArgs extends any[],
  // UArgs extends any[]
  // >(opts: O): ObjDef<O> {
>(opts: ObjOpt<N, CS, C, P>): ObjDef<ObjOpt<N, CS, C, P>> {
  type O = ObjOpt<N, CS, C, P>;

  // define children
  const childDefs: Record<string, ObjChildDef> = {};
  if (opts.children) {
    for (let cName of Object.keys(opts.children)) {
      const defOrOptsOrCS: ObjChildOpt = opts.children[cName];
      if (isCompDefs(defOrOptsOrCS)) {
        childDefs[cName] = defOrOptsOrCS;
      } else if (isObjDef(defOrOptsOrCS)) {
        childDefs[cName] = defOrOptsOrCS;
      } else {
        childDefs[cName] = defineObj(defOrOptsOrCS);
      }
    }
  }

  const createChildrenObjsAndProps = function (
    args: ObjArgs<O>
  ): ObjComponentP<C, P> {
    // create children objects
    const childEnts: Record<string, ObjChildEnt> = {};
    if (args.children) {
      for (let cName of Object.keys(args.children)) {
        const cArgs: ObjChildArg = args.children[cName];
        if (isObjChildEnt(cArgs)) {
          // already an entity
          childEnts[cName] = cArgs;
        } else {
          // create the entity
          const cDef: ObjChildDef = childDefs[cName];
          const cEnt = createObj(cDef, cArgs);
          childEnts[cName] = cEnt;
        }
      }
    }

    const p: P | {} = args.props ?? {};

    // TODO(@darzu): we could probably strengthen these types to remove all casts
    const res = {
      ...childEnts,
      ...p,
    } as ObjComponentP<C, P>;

    return res;
  };

  // TODO(@darzu): Use updatable componets instead; see notes in entity-manager.ts
  const props: ObjComponentDef<O> = EM.defineNonupdatableComponent(
    opts.name,
    createChildrenObjsAndProps
  );

  const _def: _ObjDef<O> = {
    opts,
    props,
    children: childDefs,
  };

  const def: ObjDef<O> = {
    ..._def,
    new: (a) => createObj(_def, a),
    mixin: (e, a) => mixinObj(e, _def, a),
  };

  return def;
}

function _setComp<C extends ComponentDef>(e: Entity, c: C, args: _CompArgs<C>) {
  if (c.multiArg) EM.set(e, c, ...args);
  else EM.set(e, c, args);
}

export function createObj<D extends ObjChildDef, A extends ObjChildArg<D>>(
  def: D,
  args: A
): ObjChildEnt<D> {
  if (isObjChildEnt(args)) {
    return args as ObjChildEnt<D>;
  } else {
    const e = EM.new();
    mixinObj(e, def, args);
    return e;
  }
}
export function mixinObj<D extends ObjChildDef, A extends ObjChildArg<D>>(
  e: Entity,
  def: D,
  args: A
): asserts e is ObjChildEnt<D> {
  // TODO(@darzu): i hate all these casts
  if (isObjChildEnt(args)) {
    throw `Cannot mixin two entities: ${e.id} and ${args.id}`;
  } else if (isCompDefs(def)) {
    const cArgsArr = args as unknown as _CompArrayArgs<any[]>; // TODO(@darzu): We shouldn't need such hacky casts
    def.forEach((c, i) => {
      const cArgs: any | any[] = cArgsArr[i];
      _setComp(e, c, cArgs);
    });
    // return e as ObjChildEnt<D>;
    return;
  } else if (isObjDef(def)) {
    _mixinObj(e, def, args as any);
    // return e as ObjChildEnt<D>
    return;
  }

  throw "never";
}

function _createObj<D extends _ObjDef, A extends ObjArgs<D["opts"]>>(
  def: D,
  args: A
): ObjEnt<D["opts"]> {
  const e = EM.new();
  _mixinObj(e, def, args);
  return e;
}
function _mixinObj<D extends _ObjDef, A extends ObjArgs<D["opts"]>>(
  e: Entity,
  def: D,
  args: A
): asserts e is ObjEnt<D["opts"]> {
  // TODO(@darzu): there's probably some extreme type-foo that could do this impl w/o cast

  // add components
  if (Array.isArray(args.args)) {
    const cArgs = args.args as any[][];
    (def.opts.components as ComponentDef[]).forEach((cDef, i) => {
      _setComp(e, cDef, cArgs[i] as any);
    });
  } else {
    const cArgs = args.args as Record<string, any[]>;
    for (let cDef of def.opts.components as ComponentDef[]) {
      _setComp(e, cDef, cArgs[cDef.name] as any);
    }
  }

  // add props (which creates children)
  EM.set(e, def.props, args);

  // physics parent children
  const physicsParentChildren = def.opts.physicsParentChildren ?? false;
  if (physicsParentChildren && args.children) {
    const childEnts: Record<string, Entity> = e[def.props.name];
    for (let cName of Object.keys(args.children)) {
      const cEnt = childEnts[cName];
      EM.set(cEnt, PhysicsParentDef, e.id);
    }
  }
}

export function T<N extends {}>(): (p: N) => void {
  return (p: N) => {};
}

export function testObjectTS() {
  type _A1 = AsSingle<[2], []>;
  type _A2 = AsSingle<[2], [4, 5]>;
  type _A3 = AsSingle<[], [3]>;
  type _A4 = AsSingle<[4, 5], [3]>;
  type _A5 = AsSingle<[4, 5], [2, 3]>;

  type _B1 = typeof PositionDef;
  type _B2 = typeof PositionDef extends ComponentDef<any, any, any, infer UArgs>
    ? UArgs
    : never;
  type _B3 = _B2 extends { length: infer L } ? L : never;

  const CannonObj = defineObj({
    name: "cannon",
    components: [PositionDef],
  });
  const ShipObj = defineObj({
    name: "ship2",
    propsType: T<{ myProp: number }>(),
    // updateProps: (p, n: number) => {
    //   p.myProp = n;
    //   return p;
    // },
    // dataType: (p: { myProp: number }) => {},
    components: [PositionDef, RenderableConstructDef],
    physicsParentChildren: true,
    children: {
      mast: {
        name: "mast2",
        components: [ScaleDef],
        children: {
          sail: {
            name: "sail2",
            components: [RotationDef],
          },
        },
      },
      cannonL: CannonObj,
      cannonR: CannonObj,
      gem: [ColorDef, PositionDef],
      rudder: [PositionDef, RotationDef],
    },
  } as const);

  type __t0 = (typeof ShipObj)["opts"];
  type __t5 = (typeof ShipObj)["opts"]["children"];
  type __t3<D extends ObjOpt> = D extends ObjOpt<infer N, any, infer C>
    ? // Intersect<{ [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }>
      // { [i in keyof COS]: { [_ in COS[i][0]]: Obj<COS[i][1]> } }
      {
        [n in keyof C]: C[n] extends ObjOpt<infer CN, infer CS>
          ? // ? Obj<ObjDefinition<N2, [...CS]>>
            EntityW<[...CS]>
          : never;
      }
    : // Obj<COS[0][1]>

      never;
  type __t4 = __t3<__t0>;

  if (!"true") {
    // let __o4 = null as unknown as __t4;
    // const l23 = __o4.mast.scale;
  }

  type __t1 = ObjComponentDef<__t0>;
  // type __t2 = _ObjEnt<__t0>;
  // type __t1 = ReturnType<typeof createObject<typeof ShipObj>>;

  type __t6<D extends ObjOpt> = D extends ObjOpt<infer N, any, infer C, infer P>
    ? P
    : never;
  type __t7 = __t6<__t0>;

  type __t8 = ObjArgs<__t0>["children"];

  type __t9 = _ObjDef | ObjOpt;
  type __t10 = ObjPickOpt<__t9>;
  type __t11 = ObjArgs<__t10>;

  const rudder = createObj([PositionDef, RotationDef] as const, [
    [1, 1, 1],
    undefined,
  ]);

  console.log("testGrayHelpers".toUpperCase());
  console.dir(ShipObj);
  const ship = createObj(ShipObj, {
    props: {
      myProp: 7,
    },
    args: {
      position: V(0, 0, 0),
      renderableConstruct: [CubeMesh],
    },
    children: {
      mast: {
        args: {
          scale: V(1, 1, 1),
        },
        children: {
          sail: {
            args: [undefined],
          },
        },
      },
      cannonL: {
        args: {
          position: V(1, 0, 0),
        },
      },
      cannonR: {
        args: [V(1, 0, 0)],
      },
      gem: [ENDESGA16.blue, V(1, 1, 1)],
      rudder: rudder,
    },
  });
  console.dir(ship);

  let foo = "klj" as string | undefined;
  let bar = foo?.endsWith("j");

  ship.ship2.myProp = 8;
  ship.position;
  // const cl = ship.ship["cannonL"];
  const cl = ship.ship2.cannonL;
  const se = ship.ship2.mast.mast2.sail;
  const mp: quat = se.rotation;

  const cannonLPos: vec3 = ship.ship2.cannonL.position;
  const rudderPos: vec3 = ship.ship2.rudder.position;
  ship.ship2.rudder.rotation;

  // TODO(@darzu): oo i like this one best
  // const cl3 = ship.child.cannonL;
  // const se3 = ship.child.mast.child.sail;
  // const mp3 = se.rotation;

  // const cl2 = ship.child[0];
  // const se2 = ship.child[1].child[0];
  // const mp2 = m.rotation;

  // const ShipDef = defineObject("ship", {
  //   position: [V(0,0,0)],
  //   scale: [V(1,1,1)],
  //   renderableConstruct: [CubeMesh, true],
  // }
}