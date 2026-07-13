namespace GroversSearch {
    operation Oracle(qs : Qubit[], target : Qubit) : Unit is Adj + Ctl {
        Controlled X(qs, target);
    }

    operation Diffuser(qs : Qubit[]) : Unit {
        ApplyToEach(H, qs);
        ApplyToEach(X, qs);
        Controlled Z(qs[1...], qs[0]);
        ApplyToEach(X, qs);
        ApplyToEach(H, qs);
    }

    operation Run() : Result[] {
        use qs = Qubit[6];
        use target = Qubit();
        ApplyToEach(H, qs);
        X(target);
        H(target);

        for _ in 1..3 {
            Oracle(qs, target);
            Diffuser(qs);
        }

        let results = MResetEachZ(qs);
        Reset(target);
        return results;
    }
}
