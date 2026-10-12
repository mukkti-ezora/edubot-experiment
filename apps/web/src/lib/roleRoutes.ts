import type { UserType } from "./types";

/** Landing route for each account type. The one place that maps users to their shell. */
export const HOME_FOR_TYPE: Record<UserType, string> = {
  administrator: "/dashboard",
  student: "/s",
  teacher: "/t",
  parent: "/p",
};

export function isUserType(type: string): type is UserType {
  return Object.prototype.hasOwnProperty.call(HOME_FOR_TYPE, type);
}
