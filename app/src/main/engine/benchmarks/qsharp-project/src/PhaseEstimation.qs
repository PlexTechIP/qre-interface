namespace PhaseEstimation {
    operation ApplyInverseQft(qs : Qubit[]) : Unit {
        let n = Length(qs);
        for i in 0..n - 1 {
            for j in 0..i - 1 {
                Controlled R1Frac([qs[j]], (1, i - j + 1, qs[i]));
            }
            H(qs[i]);
        }
    }

    operation ControlledUnitary(power : Int, control : Qubit, target : Qubit[]) : Unit {
        for _ in 1..power {
            Controlled Z([control], target[0]);
            Controlled Rz([control], (0.7, target[0]));
        }
    }

    operation Run() : Result[] {
        use counting = Qubit[6];
        use target = Qubit[2];
        X(target[0]);
        ApplyToEach(H, counting);

        for i in 0..Length(counting) - 1 {
            ControlledUnitary(1 <<< i, counting[i], target);
        }

        ApplyInverseQft(counting);
        let phaseResults = MResetEachZ(counting);
        let targetResults = MResetEachZ(target);
        return phaseResults + targetResults;
    }
}
