import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type { Mode, CardProps } from "./types";

type CardCmp = LazyExoticComponent<ComponentType<CardProps>>;

const allProducers: Record<string, CardCmp> = {
  FRA: lazy(() => import("./all-producers/FRA")),
};

const topProducers: Record<string, CardCmp> = {
  BRA: lazy(() => import("./top-producers/BRA")),
  IND: lazy(() => import("./top-producers/IND")),
};

const competitorsSpecialty: Record<string, CardCmp> = {
  FRA: lazy(() => import("./competitors-specialty/FRA")),
  DEU: lazy(() => import("./competitors-specialty/DEU")),
};

export const Registry: Record<Mode, Record<string, CardCmp>> = {
  "all-producers": allProducers,
  "top-producers": topProducers,
  "competitors-specialty": competitorsSpecialty,
};
