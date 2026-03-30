# Implementation details
This desktop app is a `Localset` fork of Superset desktop intended for local-only solo development.
Preserve the fork's local-first behavior: no telemetry, no external Superset-managed services, no cloud auth requirement, and no features that assume remote infrastructure unless the user explicitly requests them.
When applying upstream desktop changes, prefer runtime stability, local workflows, and offline-safe behavior over cloud-connected product features.

Use `apps/desktop/BUILDING.md` as the source of truth for desktop run/build commands and local dev environment setup.
Use `apps/desktop/RELEASE.md` as the source of truth for desktop release/version bump/tag workflow in this fork.
When asked to run the desktop app locally, prefer the documented development command from `apps/desktop/BUILDING.md`, including `SKIP_ENV_VALIDATION=1` and the isolated `SUPERSET_HOME_DIR`/`SUPERSET_WORKSPACE_NAME` settings for side-by-side local development.

For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

## tRPC Subscriptions (trpc-electron)

**Important:** While standard tRPC recommends async generators for subscriptions, `trpc-electron` (used for Electron IPC) **only supports observables**. The library explicitly checks `isObservable(result)` and throws an error otherwise. Use the `observable` pattern:

```typescript
// CORRECT for trpc-electron - use observable pattern
import { observable } from "@trpc/server/observable";

export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(() => {
      return observable<MyEvent>((emit) => {
        const handler = (data: MyData) => {
          emit.next({ type: "my-event", data });
        };

        myEmitter.on("my-event", handler);

        return () => {
          myEmitter.off("my-event", handler);
        };
      });
    }),
  });
};

// WRONG for trpc-electron - async generators don't work with IPC transport
export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(async function* () {
      // This will NOT work - the generator never gets invoked
      while (true) {
        yield await getNextEvent();
      }
    }),
  });
};
```
