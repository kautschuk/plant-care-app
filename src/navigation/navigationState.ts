export type AppScreen = 'today' | 'plants' | 'journal' | 'settings' | 'plant-detail';
const primaryScreens: readonly AppScreen[] = ['today', 'plants', 'journal'];
export function activeScreen(stack: readonly AppScreen[]): AppScreen { return stack[stack.length - 1] ?? 'today'; }
export function pushScreen(stack: readonly AppScreen[], screen: AppScreen): AppScreen[] { return activeScreen(stack) === screen ? [...stack] : [...stack, screen]; }
export function switchPrimaryScreen(stack: readonly AppScreen[], screen: 'today' | 'plants' | 'journal'): AppScreen[] { return primaryScreens.includes(screen) ? [screen] : [...stack]; }
export function goBack(stack: readonly AppScreen[]): AppScreen[] { return stack.length > 1 ? stack.slice(0, -1) : [...stack]; }
