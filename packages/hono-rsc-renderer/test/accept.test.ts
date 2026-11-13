import { expect, test } from "bun:test";
import { isMediaTypeAcceptable } from "../src/accept";

const HTML = "text/html;charset=utf-8";
const RSC = "text/x-component;charset=utf-8";

test("treats an absent Accept header as no media type preference", () => {
  expect(isMediaTypeAcceptable(undefined, HTML)).toBeTrue();
  expect(isMediaTypeAcceptable(undefined, RSC)).toBeTrue();
});

test("matches exact, type wildcard, and universal media ranges", () => {
  expect(isMediaTypeAcceptable("text/html", HTML)).toBeTrue();
  expect(isMediaTypeAcceptable("text/*;q=0.5", RSC)).toBeTrue();
  expect(isMediaTypeAcceptable("*/*;q=0.1", RSC)).toBeTrue();
});

test("uses the most specific matching range to determine quality", () => {
  expect(
    isMediaTypeAcceptable("*/*;q=1, text/*;q=0.5, text/html;q=0", HTML)
  ).toBeFalse();
  expect(
    isMediaTypeAcceptable(
      "*/*;q=0, text/*;q=0.5, text/x-component;q=1",
      RSC
    )
  ).toBeTrue();
});

test("matches representation parameters and processes q in any position", () => {
  expect(
    isMediaTypeAcceptable(
      'TEXT/X-COMPONENT;Q=0.5;CHARSET="UTF-8"',
      RSC
    )
  ).toBeTrue();
  expect(
    isMediaTypeAcceptable("text/x-component;charset=shift_jis", RSC)
  ).toBeFalse();
});

test("allows empty parameter slots between media range semicolons", () => {
  expect(isMediaTypeAcceptable("text/html;", HTML)).toBeTrue();
  expect(isMediaTypeAcceptable("text/html;;;q=0.5", HTML)).toBeTrue();
  expect(isMediaTypeAcceptable("text/html;;;q=0", HTML)).toBeFalse();
});

test("does not split delimiters inside quoted parameter values", () => {
  expect(
    isMediaTypeAcceptable(
      'text/x-component;profile="a,b;c";q=1, text/html;q=1',
      RSC
    )
  ).toBeFalse();
});

test("ignores invalid ranges without promoting invalid quality to one", () => {
  expect(
    isMediaTypeAcceptable("text/x-component;q=2, text/html;q=1", RSC)
  ).toBeFalse();
  expect(isMediaTypeAcceptable("text/x-component;q=0.0001", RSC)).toBeFalse();
  expect(isMediaTypeAcceptable("", HTML)).toBeFalse();
});
