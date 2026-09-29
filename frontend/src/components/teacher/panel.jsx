import { createContext, useContext } from "react";

import { TEACHER_PANEL } from "./panelConfig";

// Nothing wraps the teacher routes, so they read TEACHER_PANEL by default.
const PanelContext = createContext(TEACHER_PANEL);

export function PanelProvider({ panel, children }) {
  return <PanelContext.Provider value={panel}>{children}</PanelContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePanel = () => useContext(PanelContext);
