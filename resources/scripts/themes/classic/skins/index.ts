import type { CompleteSkins } from '@/sdk/theme';
import { button, newButton } from './buttons';
import { avatar, chartCard, code, copyOnClick, pagination, stat, table } from './data';
import { alert, badge, empty, progressBar, sparkline, spinner, spinnerOverlay } from './feedback';
import { checkbox, fileInput, input, label, numberInput, select, switchSkin, textArea } from './forms';
import { dialog, dropdownMenu, dropdownMenuItem, tooltip } from './overlays';
import {
    breadcrumb,
    drawer,
    keyboardShortcut,
    secretField,
    shortcutsOverlay,
    commandPalette,
    skeleton,
    statusDot,
    stepper,
    tabs,
} from './workspace';
import { card, listRow, pageFooter, pageHeading } from './surfaces';

/** The panel's own look: a recipe for every part of every primitive. */
export const classicSkins = {
    Alert: alert,
    Avatar: avatar,
    Badge: badge,
    Breadcrumb: breadcrumb,
    Button: button,
    Card: card,
    ChartCard: chartCard,
    Checkbox: checkbox,
    Code: code,
    CommandPalette: commandPalette,
    CopyOnClick: copyOnClick,
    Dialog: dialog,
    Drawer: drawer,
    DropdownMenu: dropdownMenu,
    DropdownMenuItem: dropdownMenuItem,
    Empty: empty,
    FileInput: fileInput,
    Input: input,
    KeyboardShortcut: keyboardShortcut,
    Label: label,
    ListRow: listRow,
    NewButton: newButton,
    NumberInput: numberInput,
    PageFooter: pageFooter,
    PageHeading: pageHeading,
    Pagination: pagination,
    ProgressBar: progressBar,
    SecretField: secretField,
    Select: select,
    ShortcutsOverlay: shortcutsOverlay,
    Skeleton: skeleton,
    Sparkline: sparkline,
    Spinner: spinner,
    SpinnerOverlay: spinnerOverlay,
    Stat: stat,
    StatusDot: statusDot,
    Stepper: stepper,
    Switch: switchSkin,
    Table: table,
    Tabs: tabs,
    TextArea: textArea,
    Tooltip: tooltip,
} satisfies CompleteSkins;
