namespace EkeraHastadFactoring {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ShortDiscreteLogStandIn(counting : Qubit[], work : Qubit[]) : Unit {
        for i in 0..Length(counting) - 1 {
            for w in work {
                Controlled Rz([counting[i]], (1.1, w));
            }
        }
    }

    operation Run() : Result[] {
        use counting = Qubit[7];
        use work = Qubit[8];
        ApplyToEach(H, counting);
        X(work[0]);

        ShortDiscreteLogStandIn(counting, work);
        ApplyInverseQft(counting);

        let countingResults = MResetEachZ(counting);
        let workResults = MResetEachZ(work);
        return countingResults + workResults;
    }
}
