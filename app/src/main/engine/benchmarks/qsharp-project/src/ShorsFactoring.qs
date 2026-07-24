namespace ShorsFactoring {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ModularExponentiationStandIn(counting : Qubit[], work : Qubit[]) : Unit {
        for i in 0..Length(counting) - 1 {
            for _ in 1..(1 <<< i) % 8 + 1 {
                for w in work {
                    Controlled Rz([counting[i]], (0.9, w));
                }
                Controlled X(counting[i..i], work[0]);
            }
        }
    }

    operation Run() : Result[] {
        use counting = Qubit[10];
        use work = Qubit[8];
        ApplyToEach(H, counting);
        X(work[0]);

        ModularExponentiationStandIn(counting, work);
        ApplyInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
