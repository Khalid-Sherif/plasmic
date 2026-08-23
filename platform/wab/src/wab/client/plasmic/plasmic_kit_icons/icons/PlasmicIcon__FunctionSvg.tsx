/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/* prettier-ignore-start */
import { classNames } from "@plasmicapp/react-web";
import React from "react";

export type FunctionSvgIconProps = React.ComponentProps<"svg"> & {
  title?: string;
};

export function FunctionSvgIcon(props: FunctionSvgIconProps) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      fill={"none"}
      viewBox={"0 0 24 24"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <path
        stroke={"currentColor"}
        strokeLinecap={"round"}
        strokeLinejoin={"round"}
        strokeWidth={"1.5"}
        d={
          "M14.25 6.98c0-1.338-.528-2.23-2.111-2.23s-1.889 1-2.111 2.23c-.097.538-.28 2.335-.47 4.27M4.75 17.02c0 1.338.528 2.23 2.111 2.23S8.813 18 8.972 17.02c.09-.553.343-3.276.587-5.77m0 0H6.75m2.809 0h2.691m1.5 2.5L16 16m0 0 2.25 2.25M16 16l2.25-2.25M16 16l-2.25 2.25"
        }
      ></path>
    </svg>
  );
}

export default FunctionSvgIcon;
/* prettier-ignore-end */
