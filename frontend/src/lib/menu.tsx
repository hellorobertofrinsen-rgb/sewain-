import { createContext, useContext } from "react";

// Opens the side menu (☰) from any screen inside the tabs.
export const MenuCtx = createContext<{ openMenu: () => void }>({ openMenu: () => {} });

export function useMenu() {
  return useContext(MenuCtx);
}
