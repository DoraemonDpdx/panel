import type { BreadcrumbProps } from '@/components/elements/Breadcrumb';
import type { CommandPaletteProps } from '@/components/elements/CommandPalette';
import type { DrawerSide, DrawerSize } from '@/components/elements/Drawer';
import type { KeyboardShortcutProps } from '@/components/elements/KeyboardShortcut';
import type { SecretFieldProps } from '@/components/elements/SecretField';
import type { SkeletonProps, SkeletonKind } from '@/components/elements/Skeleton';
import type { StatusDotProps, StatusDotStatus } from '@/components/elements/StatusDot';
import type { StepperProps, StepStatus } from '@/components/elements/Stepper';
import type { TabsOrientation } from '@/components/elements/Tabs';
import type { AlertProps, AlertType } from '@/components/elements/alert/Alert';
import type { AvatarProps, AvatarVariant } from '@/components/Avatar';
import type { BadgeProps, BadgeSize, BadgeVariant } from '@/components/elements/Badge';
import type { ButtonColor, ButtonProps, ButtonSize } from '@/components/elements/Button';
import type { CardProps } from '@/components/elements/Card';
import type { ChartCardProps } from '@/components/elements/ChartCard';
import type { DialogIconProps } from '@/components/elements/dialog/types';
import type { EmptyMediaVariant, EmptyProps, EmptySize } from '@/components/ui/empty';
import type { ListRowProps } from '@/components/elements/ListRow';
import type { PageFooterProps } from '@/components/elements/PageFooter';
import type { PageHeadingProps } from '@/components/elements/PageHeading';
import type { ProgressBarProps, ProgressBarVariant } from '@/components/elements/ProgressBar';
import type { SparklineProps } from '@/components/elements/Sparkline';
import type { SpinnerProps, SpinnerSize } from '@/components/elements/Spinner';
import type { StatProps, StatVariant } from '@/components/elements/Stat';

/** The colour roles shared by tone variants (Badge, ProgressBar, Stat, ListRow's status). */
export type UiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
type ControlState = { light: boolean; error: boolean };
/** A primitive whose recipes read no state. */
export type NoState = { readonly [key: string]: never };

/**
 * Every UI primitive: the state its recipes read (rendered as `data-*` on the root, or on a part
 * given its own state), and for presentational primitives the props a replacement component receives.
 */
export interface UiPrimitives {
    Alert: {
        state: { type: AlertType };
        props: AlertProps;
    };
    Avatar: { state: { variant: AvatarVariant }; props: AvatarProps };
    Badge: {
        state: { tone: UiTone; size: BadgeSize; variant: BadgeVariant };
        props: BadgeProps;
    };
    Breadcrumb: { state: NoState; props: BreadcrumbProps };
    /**
     * `label` wraps the children in a row with a gap, so an icon beside the text needs no margin.
     * `Button.Text` is `color: grey` and `Button.Danger` is `color: red`.
     */
    Button: {
        state: { color: ButtonColor; size: ButtonSize; secondary: boolean; loading: boolean };
        props: ButtonProps;
    };
    Card: {
        state: { titled: boolean; actions: boolean; loading: boolean };
        props: CardProps;
    };
    /** The frame of a chart: `legend` sits at the end of the header, `body` holds the chart. */
    ChartCard: { state: NoState; props: ChartCardProps };
    Checkbox: { state: NoState };
    Code: { state: { dark: boolean } };
    /** A floating search layer; `list` and its `item`s are plain fills. The active option has `aria-selected`. */
    CommandPalette: { state: { empty: boolean }; props: CommandPaletteProps };
    /** `target` is added to the clicked child; the other parts are the status toast. */
    CopyOnClick: { state: { status?: 'copied' | 'failed' } };
    Dialog: {
        /** `type` is the state of the `icon` part. */
        state: { described: boolean; type?: DialogIconProps['type'] };
    };
    /**
     * A modal side sheet. `viewport` positions the `root` popup at the `side` edge; `body` scrolls and `footer`
     * holds the actions. Base UI sets `data-starting-style` and `data-ending-style` for the slide.
     */
    Drawer: {
        state: { side: DrawerSide; size: DrawerSize; described: boolean; footer: boolean };
    };
    DropdownMenu: { state: { context: boolean } };
    /** `checked` is set on an item given `checked`, such as the scheme in use. */
    DropdownMenuItem: {
        state: { danger: boolean; described: boolean; checked: boolean };
    };
    Empty: {
        /** `variant` is the state of the `media` part. */
        state: { size: EmptySize; variant?: EmptyMediaVariant };
        props: EmptyProps;
    };
    FileInput: { state: NoState };
    Input: { state: ControlState };
    /** The `?` overlay's content: shortcuts as `group`s of `item`s, each a `description` and its keycaps. */
    KeyboardShortcut: { state: NoState; props: KeyboardShortcutProps };
    Label: { state: { light: boolean } };
    /**
     * `icon`, `title` and `description` are `ListRow.Icon`, `ListRow.Title` and `ListRow.Description`,
     * placed by the row's content; `status` is drawn when the row has a `status`.
     */
    ListRow: {
        state: { interactive: boolean; status?: UiTone };
        props: ListRowProps;
    };
    /** `root` is added to the Button it renders, `content` wraps the icon and label. */
    NewButton: { state: { link: boolean } };
    NumberInput: { state: ControlState };
    /** The copyright line below each page; a replacement that renders nothing drops it. */
    PageFooter: { state: NoState; props: PageFooterProps };
    PageHeading: {
        state: NoState;
        props: PageHeadingProps;
    };
    /** `page` is added to each page Button. */
    Pagination: { state: { current?: boolean } };
    ProgressBar: {
        state: { variant: ProgressBarVariant; tone: UiTone };
        props: ProgressBarProps;
    };
    /** `label` and `description` belong to the field; `control` wraps the masked `SecretInput`. */
    SecretField: { state: { empty: boolean }; props: SecretFieldProps };
    Select: {
        state: { error: boolean; multiple: boolean; selected: boolean; richLabel: boolean; searching: boolean };
    };
    ShortcutsOverlay: { state: { empty: boolean } };
    /**
     * A static placeholder: a plain fill, never animated. `row`, `card` and `chart` are containers (`body` holds
     * a row's lines); their pieces are `line`, `block` and `circle` roots with their own `kind`.
     */
    Skeleton: { state: { kind: SkeletonKind }; props: SkeletonProps };
    /**
     * `root` is the spinning element, an empty `span` with no text or role: the region that loads
     * announces it. `container` centres it when `centered`. A skin can animate anything, such as the
     * `content` of `::before`.
     */
    Spinner: {
        state: { size: SpinnerSize; blue: boolean; centered: boolean };
        props: SpinnerProps;
    };
    /**
     * A tiny line of recent values in a stretched `viewBox`: `line` is the stroke and `area` the fill beneath it.
     * It is never animated; `empty` means fewer than two samples, so nothing is drawn yet.
     */
    Sparkline: { state: { tone: UiTone; empty: boolean }; props: SparklineProps };
    SpinnerOverlay: { state: { fixed: boolean } };
    /** A transitional status shows a Spinner in place of `dot`. */
    StatusDot: { state: { status: StatusDotStatus; labelled: boolean }; props: StatusDotProps };
    /**
     * A step is `complete`, `current` or `upcoming`; `item`, `step`, `marker` and `label` carry it as `status`.
     * `interactive` means completed steps are buttons.
     */
    Stepper: { state: { interactive: boolean; status?: StepStatus }; props: StepperProps };
    /**
     * `glyph` is the icon inside `icon`; `indicator` is a bar for the tone, and `limit` follows `value`.
     * `unavailable` means the value says why there is no reading, such as "Offline".
     */
    Stat: {
        state: { variant: StatVariant; tone: UiTone; unavailable: boolean };
        props: StatProps;
    };
    /** `label` is added to the Label it renders. */
    Switch: {
        state: { described: boolean; position: 'start' | 'end' };
    };
    Table: {
        state: { fetching: boolean };
    };
    /** Base UI sets `data-selected`, `data-disabled` and `data-active` on a `tab`. */
    Tabs: { state: { orientation: TabsOrientation } };
    TextArea: { state: ControlState };
    Tooltip: { state: { side: 'top' | 'right' | 'bottom' | 'left'; arrow: boolean } };
}

/** The parts each UI primitive's skin styles, in the order they render. */
export const UI_PRIMITIVE_PARTS = {
    Alert: ['root', 'icon', 'body', 'title', 'content'],
    Avatar: ['root'],
    Badge: ['root'],
    Breadcrumb: ['root', 'list', 'item', 'link', 'current', 'separator'],
    Button: ['root', 'spinner', 'label'],
    Card: ['root', 'header', 'title', 'icon', 'actions', 'body'],
    ChartCard: ['root', 'header', 'title', 'legend', 'body'],
    Checkbox: ['root', 'indicator'],
    Code: ['root'],
    CopyOnClick: ['root', 'status', 'message', 'target'],
    Dialog: [
        'backdrop',
        'viewport',
        'container',
        'root',
        'body',
        'content',
        'header',
        'heading',
        'title',
        'description',
        'spacer',
        'footer',
        'close',
        'closeButton',
        'closeIcon',
        'icon',
        'iconGlyph',
    ],
    CommandPalette: [
        'backdrop',
        'viewport',
        'root',
        'search',
        'searchIcon',
        'input',
        'list',
        'group',
        'heading',
        'item',
        'itemLabel',
        'itemHint',
        'empty',
        'footer',
        'footerHint',
    ],
    Drawer: [
        'backdrop',
        'viewport',
        'root',
        'header',
        'heading',
        'title',
        'description',
        'closeButton',
        'closeIcon',
        'body',
        'footer',
    ],
    DropdownMenu: ['trigger', 'positioner', 'root'],
    DropdownMenuItem: ['root', 'icon', 'glyph', 'text', 'label', 'description'],
    Empty: ['root', 'header', 'media', 'title', 'description', 'content'],
    FileInput: ['root'],
    Input: ['root'],
    KeyboardShortcut: ['root', 'key'],
    Label: ['root'],
    ListRow: ['root', 'icon', 'title', 'description', 'status'],
    NewButton: ['root', 'content', 'icon'],
    NumberInput: ['root', 'input'],
    PageFooter: ['root', 'text', 'link'],
    PageHeading: ['root', 'text', 'title', 'description', 'actions'],
    Pagination: ['root', 'page'],
    ProgressBar: ['root', 'indicator'],
    SecretField: ['root', 'label', 'control', 'description'],
    Select: [
        'root',
        'input',
        'trigger',
        'positioner',
        'popup',
        'list',
        'item',
        'itemLabel',
        'indicator',
        'empty',
        'group',
        'groupLabel',
        'summary',
        'preview',
    ],
    ShortcutsOverlay: ['root', 'group', 'heading', 'list', 'item', 'description'],
    Skeleton: ['root', 'body'],
    Spinner: ['root', 'container'],
    Sparkline: ['root', 'area', 'line'],
    SpinnerOverlay: ['root', 'text'],
    StatusDot: ['root', 'dot', 'label'],
    Stepper: ['root', 'list', 'item', 'step', 'marker', 'check', 'text', 'label', 'description'],
    Stat: ['root', 'indicator', 'icon', 'glyph', 'body', 'label', 'value', 'limit'],
    Switch: ['root', 'control', 'thumb', 'text', 'label', 'description'],
    Table: ['root', 'empty', 'scroller', 'table', 'head', 'headerRow', 'headerCell', 'body', 'row', 'cell'],
    Tabs: ['root', 'list', 'tab', 'panel'],
    TextArea: ['root'],
    Tooltip: ['root', 'arrow'],
} as const satisfies { readonly [N in keyof UiPrimitives]: readonly string[] };

export type PrimitiveName = keyof UiPrimitives;
export type SkinPart<N extends PrimitiveName> = (typeof UI_PRIMITIVE_PARTS)[N][number];
export type PrimitiveState<N extends PrimitiveName> = UiPrimitives[N]['state'];
/** Presentational primitives, which a theme can also replace with a component. */
export type ReplaceableName = {
    [N in PrimitiveName]: 'props' extends keyof UiPrimitives[N] ? N : never;
}[PrimitiveName];
export type PrimitiveProps<N extends ReplaceableName> = UiPrimitives[N] extends { props: infer P extends object }
    ? P
    : never;

/** `data-ui` of a primitive: `DropdownMenuItem` → `dropdown-menu-item`. */
export function primitiveAttribute(name: PrimitiveName): string {
    return name.replaceAll(/[A-Z]/g, (letter, index: number) => `${index ? '-' : ''}${letter.toLowerCase()}`);
}
