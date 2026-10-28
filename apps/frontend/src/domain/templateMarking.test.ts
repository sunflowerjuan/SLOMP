import { describe, expect, it } from "vitest";
import type {
  DocumentBlock,
  MarkerCatalogEntry,
  MarkerSelection,
} from "../api/templates";
import {
  blockPieces,
  entryProblem,
  fieldLabels,
  isTableLoop,
  mergeAdjacent,
  rangeProblem,
  requiredProgress,
  rowKey,
  segmentsBetween,
  sortSelections,
  surplusRows,
  templateNameOf,
  templateNameProblem,
  tableRowInUse,
  trimRange,
  usedFields,
} from "./templateMarking";

function entry(
  key: string,
  overrides: Partial<MarkerCatalogEntry> = {},
): MarkerCatalogEntry {
  return {
    key,
    label: key,
    description: "",
    required: false,
    kind: "SCALAR",
    ...overrides,
  };
}

const CATALOG: MarkerCatalogEntry[] = [
  entry("resolutionNumber", { required: true }),
  entry("totalAmount", { required: true }),
  entry("rows", { required: true, kind: "TABLE_ROW" }),
  entry("rows.year", { required: true, kind: "TABLE_ROW" }),
  entry("propertyName"),
  entry("rows.capital", { kind: "TABLE_ROW" }),
];

function block(
  blockId: string,
  text: string,
  table: DocumentBlock["table"] = null,
): DocumentBlock {
  return {
    blockId,
    part: "body",
    text,
    table,
    fragments: [{ text, bold: false, italic: false }],
  };
}

function selection(
  blockId: string,
  start: number,
  end: number,
  field = "resolutionNumber",
): MarkerSelection {
  return { blockId, start, end, field };
}

const PARAGRAPH = block("body:p0", "Resolución RES-001 de 2026");
const CELL_2023 = block("body:p3", "2023", {
  tableIndex: 0,
  rowIndex: 1,
  colIndex: 0,
});
const CELL_2024 = block("body:p5", "2024", {
  tableIndex: 0,
  rowIndex: 2,
  colIndex: 0,
});

describe("required markers", () => {
  it("counts a table as used as soon as one of its fields is", () => {
    const used = usedFields([selection("body:p3", 0, 4, "rows.year")], []);
    expect(used.has("rows")).toBe(true);
    expect(requiredProgress(CATALOG, used)).toMatchObject({
      done: 2,
      total: 4,
    });
  });

  it("counts the markers the file already had", () => {
    const used = usedFields(
      [selection("body:p0", 11, 18)],
      [selection("body:p1", 0, 13, "totalAmount")],
    );
    const progress = requiredProgress(CATALOG, used);
    expect(progress.done).toBe(2);
    expect(progress.missing.map((missing) => missing.key)).toEqual([
      "rows",
      "rows.year",
    ]);
  });

  it("never offers the table itself, only its fields", () => {
    expect(CATALOG.filter(isTableLoop).map((loop) => loop.key)).toEqual([
      "rows",
    ]);
  });
});

describe("where a marker can go", () => {
  it("refuses a selection that touches an existing marker", () => {
    const marks = [selection("body:p0", 11, 18)];
    expect(
      rangeProblem({ blockId: "body:p0", start: 15, end: 22 }, marks),
    ).toBe("OVERLAP");
    expect(
      rangeProblem({ blockId: "body:p0", start: 18, end: 22 }, marks),
    ).toBe(null);
    expect(
      rangeProblem({ blockId: "body:p1", start: 11, end: 18 }, marks),
    ).toBe(null);
  });

  it("only lets table fields into a table row, and all into the same one", () => {
    const year = CATALOG[3];
    expect(entryProblem(year, PARAGRAPH, null)).toBe("OUTSIDE_TABLE");
    expect(entryProblem(year, CELL_2023, null)).toBe(null);
    expect(entryProblem(year, CELL_2024, rowKey(CELL_2023))).toBe("OTHER_ROW");
    expect(entryProblem(CATALOG[0], CELL_2024, rowKey(CELL_2023))).toBe(null);
  });

  it("finds the row the table fields already use", () => {
    const blocks = [PARAGRAPH, CELL_2023, CELL_2024];
    expect(tableRowInUse(blocks, CATALOG, [selection("body:p0", 0, 3)])).toBe(
      null,
    );
    expect(
      tableRowInUse(blocks, CATALOG, [
        selection("body:p5", 0, 4, "rows.capital"),
      ]),
    ).toBe("body:0:2");
  });

  it("tells apart tables of different parts", () => {
    const header = { ...CELL_2023, blockId: "header1:p3" };
    expect(rowKey(header)).not.toBe(rowKey(CELL_2023));
  });

  it("leaves out the spaces around the selected words", () => {
    expect(trimRange(" RES-001 ", 0, 9)).toEqual({ start: 1, end: 8 });
    expect(trimRange("a  b", 1, 3)).toBe(null);
    expect(trimRange("abc", 3, 1)).toEqual({ start: 1, end: 3 });
  });
});

describe("showing a paragraph", () => {
  it("cuts the formatting where a mark starts and ends", () => {
    const fragments = [
      { text: "Total: ", bold: false, italic: false },
      { text: "$1.250.000", bold: true, italic: false },
    ];
    expect(segmentsBetween(fragments, 5, 9)).toEqual([
      { text: ": ", bold: false, italic: false, start: 5 },
      { text: "$1", bold: true, italic: false, start: 7 },
    ]);
  });

  it("splits text and marks in reading order", () => {
    const pieces = blockPieces(PARAGRAPH, [
      { mark: selection("body:p0", 22, 26, "startYear"), source: "lawyer" },
      { mark: selection("body:p0", 11, 18), source: "file" },
    ]);
    expect(
      pieces.map((piece) =>
        piece.kind === "text"
          ? piece.segments.map((segment) => segment.text).join("")
          : `[${piece.text}]`,
      ),
    ).toEqual(["Resolución ", "[RES-001]", " de ", "[2026]"]);
  });

  it("reads an inline list written as several tags as one marker", () => {
    const tags = [
      selection("body:p0", 30, 45, "liquidations"),
      selection("body:p0", 15, 30, "liquidations"),
      selection("body:p0", 0, 15, "paymentOrderNumber"),
    ];
    expect(mergeAdjacent(tags)).toEqual([
      selection("body:p0", 0, 15, "paymentOrderNumber"),
      selection("body:p0", 15, 45, "liquidations"),
    ]);
  });

  it("names a saved version's markers in Spanish, never by key", () => {
    const catalog = [
      entry("paymentOrderNumber", { label: "Número del mandamiento" }),
      entry("liquidations", { label: "Liquidaciones", kind: "INLINE_LIST" }),
    ];
    expect(
      fieldLabels(
        [
          "liquidations",
          "liquidations.number",
          "liquidations.separator",
          "paymentOrderNumber",
          "notInCatalog",
        ],
        catalog,
      ),
    ).toEqual(["Número del mandamiento", "Liquidaciones"]);
  });

  it("sorts the selections in document order", () => {
    const blocks = [PARAGRAPH, CELL_2023];
    expect(
      sortSelections(blocks, [
        selection("body:p3", 0, 4),
        selection("body:p0", 11, 18),
        selection("body:p0", 0, 3),
      ]).map((sorted) => `${sorted.blockId}@${sorted.start}`),
    ).toEqual(["body:p0@0", "body:p0@11", "body:p3@0"]);
  });
});

describe("rows of example values", () => {
  // The lawyer's table: titles, seven rows of values and a total.
  const VALUES = [
    ["2022", "IMPUESTO PREDIAL", "$ 29.028", "$ 25.565"],
    ["2022", "SOBRETASA AMBIENTAL", "$ 8.708", "$ 7.670"],
    ["2023", "IMPUESTO PREDIAL", "$ 22.843", "$ 26.330"],
  ];
  const ROWS = [
    ["Año", "Cobro", "Interés", "Capital"],
    ...VALUES,
    ["TOTAL", "$ 371.429", "", ""],
  ];
  let index = 0;
  const TABLE: DocumentBlock[] = ROWS.flatMap((cells, rowIndex) =>
    cells.flatMap((text, colIndex) => {
      index += 1;
      return text
        ? [
            block(`body:p${index}`, text, {
              tableIndex: 0,
              rowIndex,
              colIndex,
            }),
          ]
        : [];
    }),
  );
  const firstYear = TABLE.find((candidate) => candidate.text === "2022")!;
  const example = rowKey(firstYear)!;

  it("finds the other rows filled like the example row, not the titles nor the total", () => {
    expect(surplusRows(TABLE, example, []).map(({ row }) => row)).toEqual([
      "body:0:2",
      "body:0:3",
    ]);
  });

  it("names each row by one of its blocks", () => {
    const [first] = surplusRows(TABLE, example, []);
    const named = TABLE.find(
      (candidate) => candidate.blockId === first.blockId,
    )!;
    expect(rowKey(named)).toBe(first.row);
  });

  it("never offers a row that has a marker", () => {
    const marked = TABLE.find(
      (candidate) => candidate.text === "SOBRETASA AMBIENTAL",
    )!;
    expect(
      surplusRows(TABLE, example, [selection(marked.blockId, 0, 4)]).map(
        ({ row }) => row,
      ),
    ).toEqual(["body:0:3"]);
  });
});

describe("the name a template is saved under", () => {
  it("is edited without its extension", () => {
    expect(templateNameOf("Liquidación Páez.docx")).toBe("Liquidación Páez");
    expect(templateNameOf("Mandamiento.DOCX")).toBe("Mandamiento");
  });

  it("can't be empty, too long or have slashes", () => {
    expect(templateNameProblem("Liquidación 2026")).toBe(null);
    expect(templateNameProblem("   ")).toBe("EMPTY");
    expect(templateNameProblem(".docx")).toBe("EMPTY");
    expect(templateNameProblem("a".repeat(121))).toBe("TOO_LONG");
    expect(templateNameProblem("carpeta/plantilla")).toBe("FORBIDDEN");
    expect(templateNameProblem("carpeta\\plantilla")).toBe("FORBIDDEN");
  });
});
