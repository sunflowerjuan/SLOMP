import { describe, expect, it } from "vitest";
import { conflictNotice, lockedNotice } from "./taxRoll";

const CODE_A = "155140000000000000000000000001";
const CODE_B = "155140000000000000000000000002";

describe("conflictNotice", () => {
  it("speaks of one period of one property in the singular", () => {
    expect(conflictNotice([{ cadastralCode: CODE_A, period: 2020 }])).toBe(
      "1 periodo de 1 predio ya tenía una liquidación y no se modificó.",
    );
  });

  it("counts the periods and, apart, the properties they belong to", () => {
    expect(
      conflictNotice([
        { cadastralCode: CODE_A, period: 2019 },
        { cadastralCode: CODE_A, period: 2020 },
        { cadastralCode: CODE_B, period: 2020 },
      ]),
    ).toBe(
      "3 periodos de 2 predios ya tenían una liquidación y no se modificaron.",
    );
  });

  it("keeps the property singular when every period is of the same one", () => {
    expect(
      conflictNotice([
        { cadastralCode: CODE_A, period: 2019 },
        { cadastralCode: CODE_A, period: 2020 },
      ]),
    ).toBe(
      "2 periodos de 1 predio ya tenían una liquidación y no se modificaron.",
    );
  });
});

describe("lockedNotice", () => {
  it("agrees in the singular and in the plural", () => {
    expect(lockedNotice([{ cadastralCode: CODE_A, period: 2020 }])).toBe(
      "1 periodo de 1 predio tiene su liquidación en firme y no se reemplazó.",
    );
    expect(
      lockedNotice([
        { cadastralCode: CODE_A, period: 2020 },
        { cadastralCode: CODE_B, period: 2021 },
      ]),
    ).toBe(
      "2 periodos de 2 predios tienen su liquidación en firme y no se reemplazaron.",
    );
  });
});
