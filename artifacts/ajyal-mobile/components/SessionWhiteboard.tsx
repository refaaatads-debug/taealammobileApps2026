import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

export type WhiteboardPoint = { x: number; y: number };
export type WhiteboardAction = {
  type: 'path';
  points: WhiteboardPoint[];
  color?: string;
  lineWidth?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function asPoints(value: unknown): WhiteboardPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value
    .map((point) => {
      const record = asRecord(point);
      if (!record) return null;
      const x = typeof record.x === 'number' ? record.x : Number(record.x);
      const y = typeof record.y === 'number' ? record.y : Number(record.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
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
  if (!points) return null;
  const lineWidth = typeof source.lineWidth === 'number'
    ? source.lineWidth
    : typeof source.width === 'number'
      ? source.width
      : undefined;
  return {
    type: 'path',
    points,
    color: typeof source.color === 'string' ? source.color : undefined,
    lineWidth,
  };
}

export function isWhiteboardAction(value: unknown): value is WhiteboardAction {
  return normalizeWhiteboardAction(value) !== null;
}

type SessionWhiteboardProps = {
  actions: WhiteboardAction[];
  height?: number;
  canDraw?: boolean;
  onAction?: (action: WhiteboardAction) => void;
};

export function SessionWhiteboard({
  actions,
  height = 360,
  canDraw = false,
  onAction,
}: SessionWhiteboardProps) {
  const colors = useColors();
  const [width, setWidth] = useState(320);
  const [measuredHeight, setMeasuredHeight] = useState(height);
  const [draftPoints, setDraftPoints] = useState<WhiteboardPoint[]>([]);
  const draftPointsRef = useRef<WhiteboardPoint[]>([]);
  const commitDraft = () => {
    const points = draftPointsRef.current;
    draftPointsRef.current = [];
    setDraftPoints([]);
    if (!canDraw || points.length < 2 || !onAction) return;
    onAction({
      type: 'path',
      points,
      color: colors.teal,
      lineWidth: 3,
    });
  };
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
  }), [canDraw, colors.teal]);

  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        setMeasuredHeight(event.nativeEvent.layout.height);
      }}
      {...panResponder.panHandlers}
      style={[styles.board, { height, backgroundColor: colors.background }, canDraw && styles.drawEnabled]}
    >
      <Svg width={width} height={measuredHeight}>
        {[...actions, ...(draftPoints.length > 1 ? [{
          type: 'path' as const,
          points: draftPoints,
          color: colors.teal,
          lineWidth: 3,
        }] : [])].map((action, index) => (
          <Polyline
            key={`${index}-${action.points.length}`}
            points={action.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={action.color ?? colors.teal}
            strokeWidth={action.lineWidth ?? 3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
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
  drawEnabled: { cursor: 'crosshair' } as any,
  empty: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});