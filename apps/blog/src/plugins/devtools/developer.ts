/** DevtoolsDeveloper 服务的实现：可安装的开发插件登记表（契约见 ./api） */
import type { DevtoolsDeveloperService, DeveloperPluginEntry } from "./api";

export const createDeveloperRegistry = () => {
  const entries = new Map<string, DeveloperPluginEntry>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const cb of listeners) cb();
  };

  const service: DevtoolsDeveloperService = {
    register: (entry) => {
      entries.set(entry.id, entry);
      emit();
      return () => {
        // 只移除本次登记的条目：同 id 已被后续登记替换时不受影响
        if (entries.get(entry.id) !== entry) return;
        entries.delete(entry.id);
        emit();
      };
    },
  };

  return {
    service,
    list: (): ReadonlyArray<DeveloperPluginEntry> => [...entries.values()],
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
};

export type DeveloperRegistry = ReturnType<typeof createDeveloperRegistry>;
