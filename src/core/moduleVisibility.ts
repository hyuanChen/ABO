export const MODULES_HIDDEN_FROM_MANAGEMENT = [
  "xiaoyuzhou-tracker",
  "zhihu-tracker",
  "folder-monitor",
] as const;

const hiddenModuleIdSet = new Set<string>(MODULES_HIDDEN_FROM_MANAGEMENT);

export function isModuleHiddenFromManagement(moduleId: string): boolean {
  return hiddenModuleIdSet.has(moduleId);
}

export function filterModulesForManagement<T extends { id: string }>(modules: T[]): T[] {
  return modules.filter((module) => !isModuleHiddenFromManagement(module.id));
}

export function filterHiddenManagementModules<T extends { id: string }>(modules: T[]): T[] {
  return modules.filter((module) => isModuleHiddenFromManagement(module.id));
}
