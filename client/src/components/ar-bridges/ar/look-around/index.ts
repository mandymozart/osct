export * from "./look-around";
export { deviceQuaternion } from "./orientation";

/** On unless switched off for this browser: `localStorage["osct-look-around"] = "off"` */
export const lookAroundEnabled = (): boolean => {
  try {
    return localStorage.getItem("osct-look-around") !== "off";
  } catch {
    return true;
  }
};
