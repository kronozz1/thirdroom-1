import * as RAPIER from "@dimforge/rapier3d-compat";
import { addEntity, createWorld, IWorld } from "bitecs";

import { addTransformComponent, updateMatrixWorld } from "./component/transform";
import { createCursorBuffer } from "./allocator/CursorBuffer";
import { maxEntities, tickRate } from "./config";
import {
  registerRemoteResourceLoader,
  RemoteResourceManager,
  createRemoteResourceManager,
} from "./resources/RemoteResourceManager";
import { GLTFRemoteResourceLoader } from "./resources/GLTFResourceLoader";
import { MeshRemoteResourceLoader } from "./resources/MeshResourceLoader";
import { copyToWriteBuffer, getReadBufferIndex, swapWriteBuffer, TripleBufferState } from "./TripleBuffer";
import { createInputState, InputState, InputStateGetters } from "./input/InputManager";
import { MaterialRemoteResourceLoader } from "./resources/MaterialResourceLoader";
import { GeometryRemoteResourceLoader } from "./resources/GeometryResourceLoader";
import {
  InitializeGameWorkerMessage,
  WorkerMessages,
  WorkerMessageType,
  GameWorkerInitializedMessage,
  GameWorkerErrorMessage,
} from "./WorkerMessage";
import { ActionState, ActionMap } from "./input/ActionMappingSystem";
import { inputReadSystem } from "./input/inputReadSystem";
import { renderableBuffer } from "./component";
import { CameraRemoteResourceLoader } from "./resources/CameraResourceLoader";
import { init } from "../game";

const workerScope = globalThis as typeof globalThis & Worker;

const onMessage =
  (state: World) =>
  ({ data }: any) => {
    if (typeof data !== "object") {
      return;
    }

    // const message = data as WorkerMessages;

    // todo: messages
  };

async function onInitMessage({ data }: { data: WorkerMessages }) {
  if (typeof data !== "object") {
    return;
  }

  const message = data as WorkerMessages;

  if (message.type === WorkerMessageType.InitializeGameWorker) {
    try {
      if (message.renderWorkerMessagePort) {
        message.renderWorkerMessagePort.start();
      }

      const state = await onInit(message);

      postMessage({
        type: WorkerMessageType.GameWorkerInitialized,
      } as GameWorkerInitializedMessage);

      workerScope.addEventListener("message", onMessage(state));

      if (message.renderWorkerMessagePort) {
        message.renderWorkerMessagePort.addEventListener("message", onMessage(state));
      }
    } catch (error) {
      postMessage({
        type: WorkerMessageType.GameWorkerError,
        error,
      } as GameWorkerErrorMessage);
    }

    workerScope.removeEventListener("message", onInitMessage);
  }
}

workerScope.addEventListener("message", onInitMessage);

export interface TimeState {
  elapsed: number;
  dt: number;
}

export type World = IWorld;

export type RenderPort = MessagePort | (typeof globalThis & Worker);

export interface RenderState {
  tripleBuffer: TripleBufferState;
  port: RenderPort;
}

export interface GameInputState {
  tripleBuffer: TripleBufferState;
  inputStates: InputState[];
  actions: Map<string, ActionState>;
  actionMaps: ActionMap[];
  raw: { [path: string]: number };
}

export type System = (state: GameState) => void;

export interface GameState {
  world: World;
  physicsWorld: RAPIER.World;
  renderer: RenderState;
  time: TimeState;
  resourceManager: RemoteResourceManager;
  input: GameInputState;
  systems: System[];
  scene: number;
}

const generateInputGetters = (
  inputStates: InputState[],
  inputTripleBuffer: TripleBufferState
): { [path: string]: number } =>
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(InputStateGetters).map(([path, getter]) => [
        path,
        { enumerable: true, get: () => getter(inputStates[getReadBufferIndex(inputTripleBuffer)]) },
      ])
    )
  );

async function onInit({
  inputTripleBuffer,
  resourceManagerBuffer,
  renderWorkerMessagePort,
  renderableTripleBuffer,
}: InitializeGameWorkerMessage): Promise<GameState> {
  const renderPort = renderWorkerMessagePort || workerScope;

  const world = createWorld<World>(maxEntities);

  // noop entity
  addEntity(world);

  const scene = addEntity(world);
  addTransformComponent(world, scene);

  await RAPIER.init();

  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
  const physicsWorld = new RAPIER.World(gravity);

  const inputStates = inputTripleBuffer.buffers
    .map((buffer) => createCursorBuffer(buffer))
    .map((buffer) => createInputState(buffer));

  const resourceManager = createRemoteResourceManager(resourceManagerBuffer, renderPort);

  registerRemoteResourceLoader(resourceManager, GeometryRemoteResourceLoader);
  registerRemoteResourceLoader(resourceManager, MaterialRemoteResourceLoader);
  registerRemoteResourceLoader(resourceManager, MeshRemoteResourceLoader);
  registerRemoteResourceLoader(resourceManager, CameraRemoteResourceLoader);
  registerRemoteResourceLoader(resourceManager, GLTFRemoteResourceLoader);

  const renderer: RenderState = {
    tripleBuffer: renderableTripleBuffer,
    port: renderPort,
  };

  const input: GameInputState = {
    tripleBuffer: inputTripleBuffer,
    inputStates,
    actions: new Map(),
    actionMaps: [],
    raw: generateInputGetters(inputStates, inputTripleBuffer),
  };

  const time: TimeState = {
    elapsed: performance.now(),
    dt: 0,
  };

  const state: GameState = {
    world,
    scene,
    resourceManager,
    renderer,
    physicsWorld,
    input,
    time,
    systems: [],
  };

  await init(state);

  update(state);

  return state;
}

const updateWorldMatrixSystem = (state: GameState) => {
  updateMatrixWorld(state.scene);
};

const renderableTripleBufferSystem = ({ renderer }: GameState) => {
  copyToWriteBuffer(renderer.tripleBuffer, renderableBuffer);
  swapWriteBuffer(renderer.tripleBuffer);
};

const timeSystem = ({ time }: GameState) => {
  const now = performance.now();
  time.dt = (now - time.elapsed) / 1000;
  time.elapsed = now;
};

const pipeline = (state: GameState) => {
  timeSystem(state);
  inputReadSystem(state);

  for (let i = 0; i < state.systems.length; i++) {
    state.systems[i](state);
  }

  updateWorldMatrixSystem(state);
  renderableTripleBufferSystem(state);
};

function update(state: GameState) {
  pipeline(state);

  const frameDuration = performance.now() - state.time.elapsed;
  const remainder = 1000 / tickRate - frameDuration;

  if (remainder > 0) {
    // todo: call fixed timestep physics pipeline here
    setTimeout(() => update(state), remainder);
  } else {
    update(state);
  }
}