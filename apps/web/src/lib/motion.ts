import type { Variants, Transition } from "framer-motion";

/* ── Shared timing ─────────────────────────────────────────────── */

export const spring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 24,
};

export const springBouncy: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 20,
};

export const easeOut: Transition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1],
};

export const easeOutSlow: Transition = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

/* ── Page transitions ──────────────────────────────────────────── */

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export const pageTransition: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

/* ── Stagger children ──────────────────────────────────────────── */

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
};

/* ── Overlay / backdrop ────────────────────────────────────────── */

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const overlayTransition: Transition = {
  duration: 0.2,
};

/* ── Drawer (slide from right) ─────────────────────────────────── */

export const drawerVariants: Variants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};

export const drawerTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 35,
};

/* ── Dialog (scale + fade) ─────────────────────────────────────── */

export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

export const dialogTransition: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
};

/* ── Menu (origin-aware scale) ─────────────────────────────────── */

export const menuVariants: Variants = {
  initial: { opacity: 0, scale: 0.92, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: -2 },
};

export const menuTransition: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 28,
};

/* ── Toast (slide up from bottom) ──────────────────────────────── */

export const toastVariants: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } },
};

export const toastTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
};

/* ── Sidebar mobile (slide from left) ──────────────────────────── */

export const sidebarVariants: Variants = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" },
};

export const sidebarTransition: Transition = {
  type: "spring",
  stiffness: 350,
  damping: 30,
};
