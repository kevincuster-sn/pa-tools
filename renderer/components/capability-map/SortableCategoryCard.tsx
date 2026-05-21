'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { CategoryCard, type CategoryCardProps } from './CategoryCard';

export function SortableCategoryCard(props: CategoryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className="-ml-0.5 flex h-5 w-4 cursor-grab touch-none items-center justify-center text-fg-subtle hover:text-fg focus:outline-none focus-visible:ring-1 focus-visible:ring-accent active:cursor-grabbing"
      aria-label={`Reorder ${props.category.name}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} />
    </button>
  );

  return (
    <CategoryCard
      {...props}
      containerRef={setNodeRef}
      containerStyle={style}
      isDragging={isDragging}
      dragHandle={handle}
    />
  );
}
