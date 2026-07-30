namespace QuantumDynamics {
    operation TrotterStep(qs : Qubit[], theta : Double) : Unit {
        for i in 0..Length(qs) - 2 {
            CNOT(qs[i], qs[i + 1]);
            Rz(theta, qs[i + 1]);
            CNOT(qs[i], qs[i + 1]);
        }
        for q in qs {
            Rx(theta, q);
        }
    }

    operation Run() : Result[] {
        use qs = Qubit[8];
        for _ in 1..6 {
            TrotterStep(qs, 0.31);
        }
        return MResetEachZ(qs);
    }
}
