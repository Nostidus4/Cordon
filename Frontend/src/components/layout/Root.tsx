import { Outlet } from "react-router-dom";
import { useStreamBridge } from "../../hooks/useStream";
import { CommandPalette, ToastViewport } from "../ui";

/** Wraps every route (shell screens and /city): stream bridge, toasts, ⌘K. */
export function Root() {
  useStreamBridge();
  return (
    <>
      <Outlet />
      <ToastViewport />
      <CommandPalette />
    </>
  );
}
