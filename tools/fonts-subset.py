#!/usr/bin/env python3
"""AUROS — instance and subset one font face to woff2.

Called by tools/fetch-fonts.mjs, one face per invocation. Kept separate because fontTools is a
Python library and shelling out to `pyftsubset` is not portable (it is not on PATH in every
install, including this machine's).

Nothing here silently degrades. A missing axis, an empty glyph set or a failed woff2 encode is a
non-zero exit, because the alternative is a site that loads a font with no glyphs in it and looks
fine in review.
"""
from __future__ import annotations

import argparse
import sys
from io import BytesIO

from fontTools import subset
from fontTools.ttLib import TTFont


def parse_unicodes(spec: str) -> set[int]:
    """'U+0000-00FF,U+0131' -> {0, 1, ..., 255, 0x131}."""
    out: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if part.upper().startswith("U+"):
            part = part[2:]
        if "-" in part:
            lo, hi = part.split("-", 1)
            out.update(range(int(lo, 16), int(hi, 16) + 1))
        else:
            out.add(int(part, 16))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--unicodes", required=True)
    ap.add_argument(
        "--instance",
        default=None,
        help="Pin variable axes, e.g. 'wght=400,wdth=100'. Produces a static face.",
    )
    ap.add_argument(
        "--all-layout-features",
        action="store_true",
        help="Keep every GSUB/GPOS feature. Required for complex scripts (Devanagari).",
    )
    args = ap.parse_args()

    font = TTFont(args.src)

    if args.instance:
        if "fvar" not in font:
            print(f"error: --instance given but {args.src} is not a variable font", file=sys.stderr)
            return 2
        from fontTools.varLib import instancer

        axes = {}
        for pair in args.instance.split(","):
            name, _, value = pair.partition("=")
            axes[name.strip()] = float(value)
        available = {a.axisTag for a in font["fvar"].axes}
        missing = set(axes) - available
        if missing:
            print(
                f"error: {args.src} has no axis {sorted(missing)}; it has {sorted(available)}",
                file=sys.stderr,
            )
            return 2
        font = instancer.instantiateVariableFont(font, axes, inplace=False, updateFontNames=True)

    wanted = parse_unicodes(args.unicodes)
    have = set()
    for table in font["cmap"].tables:
        have.update(table.cmap.keys())
    keep = wanted & have
    if not keep:
        print(
            f"error: subsetting {args.src} to the requested range would leave 0 glyphs. "
            "That is a wrong range or a wrong file, not a small font.",
            file=sys.stderr,
        )
        return 3

    options = subset.Options()
    options.flavor = "woff2"
    options.with_zopfli = False
    options.desubroutinize = False
    options.hinting = True
    options.drop_tables += ["DSIG"]
    options.notdef_outline = True
    # Keep the name table entries a browser and a licence audit both need.
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.name_legacy = True
    options.recalc_bounds = True
    if args.all_layout_features:
        options.layout_features = ["*"]

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=keep)
    subsetter.subset(font)

    buf = BytesIO()
    font.save(buf)
    data = buf.getvalue()
    if len(data) < 256:
        print(f"error: woff2 output for {args.dst} is {len(data)} bytes — that is not a font", file=sys.stderr)
        return 4
    with open(args.dst, "wb") as fh:
        fh.write(data)

    covered = len(keep)
    requested = len(wanted)
    print(
        f"{args.dst}: {covered}/{requested} requested codepoints present in the source face",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
