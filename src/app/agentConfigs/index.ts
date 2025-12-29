import { AllAgentConfigsType } from "@/app/types";
import frontDeskAuthentication from "./frontDeskAuthentication";
import customerServiceRetail from "./customerServiceRetail";
import customerServiceWithSupervision from "./customerServiceWithSupervision";
import simpleExample from "./simpleExample";

export const allAgentSets: AllAgentConfigsType = {
  frontDeskAuthentication,
  customerServiceRetail,
  customerServiceWithSupervision,
  simpleExample,
};

export const defaultAgentSetKey = "simpleExample";
