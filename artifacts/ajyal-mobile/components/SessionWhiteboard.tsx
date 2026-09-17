import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, Line as SvgLine, Polyline, Rect as SvgRect, Text as SvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export type WhiteboardPoint = { x: number; y: number };
export type WhiteboardAction = {
  type: 'path' | 'line' | 'rect' | 'circle' | 'text';
  points?: WhiteboardPoint[];
  color?: string;
  lineWidth?: number;
  opacity?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string;
  fontSize?: number;
  coordinateSpace?: 'virtual' | 'local';
};

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function asPoints(value: unknown): WhiteboardPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value
    .map((point) => {
      const record = asRecord(point);
      if (!record) return null;
      const x = asNumber(record.x);
      const y = asNumber(record.y);
      return x !== undefined && y !== undefined ? { x, y } : null;
    })
    .filter((point): point is WhiteboardPoint => Boolean(point));
  return points.length >= 2 ? points : null;
}

export function normalizeWhiteboardAction(value: unknown): WhiteboardAction | null {
  const action = asRecord(value);
  if (!action) return null;
  const nestedData = asRecord(action.data);
  const nestedAction = asRecord(action.action);
  const source = nestedAction ?? nestedData ?? action;
  const points = asPoints(source.points)
    ?? asPoints(source.path)
    ?? asPoints(source.coordinates)
    ?? asPoints(source.pointsData);
  const sourceType = typeof source.type === 'string' ? source.type.toLowerCase() : '';
  const type = sourceType === 'line' && points
    ? 'line'
    : sourceType === 'rect' && asNumber(source.x) !== undefined && asNumber(source.y) !== undefined
      ? 'rect'
      : sourceType === 'circle' && asNumber(source.x) !== undefined && asNumber(source.y) !== undefined
        ? 'circle'
        : sourceType === 'text' && asNumber(source.x) !== undefined && asNumber(source.y) !== undefined && typeof source.text === 'string'
          ? 'text'
          : points
            ? 'path'
            : null;
  if (!type) return null;
  const lineWidth = asNumber(source.lineWidth) ?? asNumber(source.width);
  const coordinateSpace = source.coordinateSpace === 'local' ? 'local' : 'virtual';
  return {
    type,
    points: points ?? undefined,
    color: typeof source.color === 'string' ? source.color : undefined,
    lineWidth,
    opacity: asNumber(source.opacity),
    x: asNumber(source.x),
    y: asNumber(source.y),
    w: asNumber(source.w),
    h: asNumber(source.h),
    r: asNumber(source.r),
    text: typeof source.text === 'string' ? source.text : undefined,
    fontSize: asNumber(source.fontSize),
    coordinateSpace,
  };
}

export function isWhiteboardAction(value: unknown): value is WhiteboardAction {
  return normalizeWhiteboardAction(value) !== null;
}

type SessionWhiteboardProps = {
  actions: WhiteboardAction[];
  height?: number;
  fill?: boolean;
  canDraw?: boolean;
  onAction?: (action: WhiteboardAction) => void;
};

export function SessionWhiteboard({
  actions,
  height = 360,
  fill = false,
  canDraw = false,
  onAction,
}: SessionWhiteboardProps) {
  const colors = useColors();
  const [width, setWidth] = useState(320);
  const [measuredHeight, setMeasuredHeight] = useState(height);
  const [draftPoints, setDraftPoints] = useState<WhiteboardPoint[]>([]);
  const draftPointsRef = useRef<WhiteboardPoint[]>([]);
  const toVirtualAction = useCallback((action: WhiteboardAction): WhiteboardAction => {
    if (action.coordinateSpace === 'virtual') return action;
    const scaleX = VIRTUAL_WIDTH / Math.max(1, width);
    const scaleY = VIRTUAL_HEIGHT / Math.max(1, measuredHeight);
    const scale = Math.min(scaleX, scaleY);
    return {
      ...action,
      coordinateSpace: 'virtual',
      points: action.points?.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
      x: action.x === undefined ? undefined : action.x * scaleX,
      y: action.y === undefined ? undefined : action.y * scaleY,
      w: action.w === undefined ? undefined : action.w * scaleX,
      h: action.h === undefined ? undefined : action.h * scaleY,
      r: action.r === undefined ? undefined : action.r * scale,
      lineWidth: action.lineWidth === undefined ? undefined : action.lineWidth * scale,
      fontSize: action.fontSize === undefined ? undefined : action.fontSize * scale,
    };
  }, [measuredHeight, width]);
  const toLocalPoint = useCallback((point: WhiteboardPoint, coordinateSpace?: WhiteboardAction['coordinateSpace']) => {
    if (coordinateSpace === 'local') return point;
    return {
      x: point.x * width / VIRTUAL_WIDTH,
      y: point.y * measuredHeight / VIRTUAL_HEIGHT,
    };
  }, [measuredHeight, width]);
  const localScale = useCallback((coordinateSpace?: WhiteboardAction['coordinateSpace']) => (
    coordinateSpace === 'local' ? 1 : Math.min(width / VIRTUAL_WIDTH, measuredHeight / VIRTUAL_HEIGHT)
  ), [measuredHeight, width]);
  const commitDraft = useCallback(() => {
    const points = draftPointsRef.current;
    draftPointsRef.current = [];
    setDraftPoints([]);
    if (!canDraw || points.length < 2 || !onAction) return;
    onAction(toVirtualAction({
      type: 'path',
      points,
      color: colors.teal,
      lineWidth: 3,
      coordinateSpace: 'local',
    }));
  }, [canDraw, colors.teal, onAction, toVirtualAction]);
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => canDraw,
    onMoveShouldSetPanResponder: () => canDraw,
    onPanResponderGrant: (event) => {
      if (!canDraw) return;
      const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      draftPointsRef.current = [point];
      setDraftPoints([point]);
    },
    onPanResponderMove: (event) => {
      if (!canDraw) return;
      const point = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      draftPointsRef.current = [...draftPointsRef.current, point];
      setDraftPoints((current) => [...current, point]);
    },
    onPanResponderRelease: commitDraft,
    onPanResponderTerminate: commitDraft,
    onPanResponderTerminationRequest: () => false,
  }), [canDraw, commitDraft]);

  const renderAction = (action: WhiteboardAction, index: number) => {
    const scale = localScale(action.coordinateSpace);
    const color = action.color ?? colors.teal;
    const opacity = action.opacity ?? 1;
    const lineWidth = Math.max(1, (action.lineWidth ?? 3) * scale);
    if ((action.type === 'path' || action.type === 'line') && action.points?.length) {
      const points = action.points.map((point) => toLocalPoint(point, action.coordinateSpace));
      if (action.type === 'line' && points.length >= 2) {
        return (
          <SvgLine
            key={`${index}-${action.type}-${points.length}`}
            x1={points[0].x}
            y1={points[0].y}
            x2={points[1].x}
            y2={points[1].y}
            stroke={color}
            strokeWidth={lineWidth}
            strokeLinecap="round"
            opacity={opacity}
          />
        );
      }
      return (
        <Polyline
          key={`${index}-${action.type}-${points.length}`}
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      );
    }
    if (action.type === 'rect' && action.x !== undefined && action.y !== undefined) {
      return (
        <SvgRect
          key={`${index}-${action.type}-${action.x}-${action.y}`}
          x={action.x * (action.coordinateSpace === 'local' ? 1 : width / VIRTUAL_WIDTH)}
          y={action.y * (action.coordinateSpace === 'local' ? 1 : measuredHeight / VIRTUAL_HEIGHT)}
          width={(action.w ?? 0) * (action.coordinateSpace === 'local' ? 1 : width / VIRTUAL_WIDTH)}
          height={(action.h ?? 0) * (action.coordinateSpace === 'local' ? 1 : measuredHeight / VIRTUAL_HEIGHT)}
          fill="none"
          stroke={color}
          strokeWidth={lineWidth}
          opacity={opacity}
        />
      );
    }
    if (action.type === 'circle' && action.x !== undefined && action.y !== undefined) {
      return (
        <SvgCircle
          key={`${index}-${action.type}-${action.x}-${action.y}`}
          cx={action.x * (action.coordinateSpace === 'local' ? 1 : width / VIRTUAL_WIDTH)}
          cy={action.y * (action.coordinateSpace === 'local' ? 1 : measuredHeight / VIRTUAL_HEIGHT)}
          r={(action.r ?? 0) * scale}
          fill="none"
          stroke={color}
          strokeWidth={lineWidth}
          opacity={opacity}
        />
      );
    }
    if (action.type === 'text' && action.x !== undefined && action.y !== undefined && action.text) {
      return (
        <SvgText
          key={`${index}-${action.type}-${action.x}-${action.y}`}
          x={action.x * (action.coordinateSpace === 'local' ? 1 : width / VIRTUAL_WIDTH)}
          y={action.y * (action.coordinateSpace === 'local' ? 1 : measuredHeight / VIRTUAL_HEIGHT)}
          fill={color}
          fontSize={Math.max(10, (action.fontSize ?? 18) * scale)}
          opacity={opacity}
        >
          {action.text}
        </SvgText>
      );
    }
    return null;
  };

  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        setMeasuredHeight(event.nativeEvent.layout.height);
      }}
      {...panResponder.panHandlers}
      style={[styles.board, fill && styles.fill, !fill && { height }, { backgroundColor: colors.background }, canDraw && styles.drawEnabled]}
    >
      <Svg width={width} height={measuredHeight}>
        {actions.map(renderAction)}
        {draftPoints.length > 1 ? (
          <Polyline
            points={draftPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={colors.teal}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
      {!actions.length ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          {canDraw ? 'يمكنك الكتابة على السبورة' : 'السبورة مفعلة — بانتظار رسم المعلم'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: '100%', justifyContent: 'center', alignItems: 'center' },
  fill: { flex: 1, height: '100%' },
  drawEnabled: { cursor: 'crosshair' } as any,
  empty: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});