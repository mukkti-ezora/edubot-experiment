/**
 * EduBot's icon set: Phosphor, one family, one weight. The Icon* names are the app's
 * stable vocabulary; swap the backing glyph here, never at call sites.
 */
import type { SVGProps } from "react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  CalendarCheck as PhCalendarCheck,
  ChartLineUp as PhChartLineUp,
  CloudArrowDown as PhCloudArrowDown,
  Exam as PhExam,
  FilePdf as PhFilePdf,
  Image as PhImage,
  ListChecks as PhListChecks,
  Paperclip as PhPaperclip,
  Target as PhTarget,
  Translate as PhTranslate,
  Trash as PhTrash,
  WifiSlash as PhWifiSlash,
} from "@phosphor-icons/react";
import {
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp,
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  Book as PhBook,
  BookOpen as PhBookOpen,
  Buildings as PhBuildings,
  CalendarBlank as PhCalendarBlank,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUpDown as PhCaretUpDown,
  ChatCircleText as PhChatCircleText,
  ChatsCircle as PhChatsCircle,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  Clock as PhClock,
  Command as PhCommand,
  Copy as PhCopy,
  CurrencyDollar as PhCurrencyDollar,
  DotsThree as PhDotsThree,
  EnvelopeSimple as PhEnvelopeSimple,
  Eye as PhEye,
  FileText as PhFileText,
  Funnel as PhFunnel,
  GearSix as PhGearSix,
  Globe as PhGlobe,
  GraduationCap as PhGraduationCap,
  Hash as PhHash,
  Heart as PhHeart,
  House as PhHouse,
  Info as PhInfo,
  Key as PhKey,
  List as PhList,
  Lock as PhLock,
  MagnifyingGlass as PhMagnifyingGlass,
  PaperPlaneTilt as PhPaperPlaneTilt,
  PencilSimple as PhPencilSimple,
  Plus as PhPlus,
  Prohibit as PhProhibit,
  Pulse as PhPulse,
  Record as PhRecord,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  SignOut as PhSignOut,
  Sparkle as PhSparkle,
  SquaresFour as PhSquaresFour,
  Student as PhStudent,
  Tray as PhTray,
  TrendUp as PhTrendUp,
  User as PhUser,
  UserPlus as PhUserPlus,
  UsersThree as PhUsersThree,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  X as PhX,
} from "@phosphor-icons/react";

type IconProps = SVGProps<SVGSVGElement>;

function icon(Glyph: PhosphorIcon) {
  return function EduBotIcon({ width, height, ref: _ref, ...rest }: IconProps) {
    return <Glyph size={width ?? height ?? 16} weight="regular" aria-hidden="true" {...(rest as object)} />;
  };
}

export const IconDashboard = icon(PhSquaresFour);
export const IconBuilding = icon(PhBuildings);
export const IconUsers = icon(PhUsersThree);
export const IconUser = icon(PhUser);
export const IconUserPlus = icon(PhUserPlus);
export const IconKey = icon(PhKey);
export const IconShield = icon(PhShield);
export const IconShieldCheck = icon(PhShieldCheck);
export const IconActivity = icon(PhPulse);
export const IconSettings = icon(PhGearSix);
export const IconSearch = icon(PhMagnifyingGlass);
export const IconChevronDown = icon(PhCaretDown);
export const IconChevronRight = icon(PhCaretRight);
export const IconChevronLeft = icon(PhCaretLeft);
export const IconChevronUpDown = icon(PhCaretUpDown);
export const IconPlus = icon(PhPlus);
export const IconX = icon(PhX);
export const IconCheck = icon(PhCheck);
export const IconCheckCircle = icon(PhCheckCircle);
export const IconAlertTriangle = icon(PhWarning);
export const IconAlertCircle = icon(PhWarningCircle);
export const IconInfo = icon(PhInfo);
export const IconMenu = icon(PhList);
export const IconDots = icon(PhDotsThree);
export const IconLogout = icon(PhSignOut);
export const IconMessage = icon(PhChatCircleText);
export const IconChats = icon(PhChatsCircle);
export const IconDollar = icon(PhCurrencyDollar);
export const IconCommand = icon(PhCommand);
export const IconClock = icon(PhClock);
export const IconGlobe = icon(PhGlobe);
export const IconMail = icon(PhEnvelopeSimple);
export const IconArrowUpRight = icon(PhArrowUpRight);
export const IconArrowRight = icon(PhArrowRight);
export const IconArrowLeft = icon(PhArrowLeft);
export const IconArrowUp = icon(PhArrowUp);
export const IconArrowDown = icon(PhArrowDown);
export const IconFilter = icon(PhFunnel);
export const IconInbox = icon(PhTray);
export const IconEye = icon(PhEye);
export const IconPencil = icon(PhPencilSimple);
export const IconRefresh = icon(PhArrowsClockwise);
export const IconBan = icon(PhProhibit);
export const IconCalendar = icon(PhCalendarBlank);
export const IconFileText = icon(PhFileText);
export const IconHome = icon(PhHouse);
export const IconHash = icon(PhHash);
export const IconLock = icon(PhLock);
export const IconSend = icon(PhPaperPlaneTilt);
export const IconCircleDot = icon(PhRecord);
export const IconBook = icon(PhBook);
export const IconCopy = icon(PhCopy);
export const IconGraduationCap = icon(PhGraduationCap);
export const IconBookOpen = icon(PhBookOpen);
export const IconHeart = icon(PhHeart);
export const IconSparkles = icon(PhSparkle);
export const IconSchool = icon(PhStudent);
export const IconTrendingUp = icon(PhTrendUp);
export const IconExam = icon(PhExam);
export const IconChartLine = icon(PhChartLineUp);
export const IconTarget = icon(PhTarget);
export const IconPaperclip = icon(PhPaperclip);
export const IconImage = icon(PhImage);
export const IconFilePdf = icon(PhFilePdf);
export const IconTranslate = icon(PhTranslate);
export const IconCloudDownload = icon(PhCloudArrowDown);
export const IconWifiOff = icon(PhWifiSlash);
export const IconTrash = icon(PhTrash);
export const IconCalendarCheck = icon(PhCalendarCheck);
export const IconListChecks = icon(PhListChecks);
